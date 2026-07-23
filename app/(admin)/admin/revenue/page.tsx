import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { getRevenueSummary } from "@/lib/dal/services";
import { getPaymentsOverview } from "@/lib/dal/payments";
import { captureSnapshotIfStale, getRevenueHistory } from "@/lib/dal/revenue";
import { paymentProviderName, stripeWebhookConfigured } from "@/lib/payments";
import { formatMoney, primaryTotal } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import {
  Card,
  EmptyState,
  Money,
  PaymentStatusBadge,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { MrrTrend, RevenueBars } from "@/components/admin/charts";

/* ---------------------------------------------------------------------------
   Revenue — the money view.

   The Overview answers "how are we doing today". This answers "which way is it
   going": MRR month by month, what started and what churned, what has actually
   been collected, and what has been asked for and not paid.
--------------------------------------------------------------------------- */

export default async function RevenuePage() {
  await verifySession();

  // Best-effort, at most once a day: today's numbers become a permanent record
  // so next month's chart isn't a reconstruction. Never blocks the render.
  await captureSnapshotIfStale();

  const [summary, history, payments] = await Promise.all([
    getRevenueSummary(),
    getRevenueHistory(12),
    getPaymentsOverview(),
  ]);

  const revenue = primaryTotal(summary.totals);
  const collected = primaryTotal(payments.collectedThisMonth, history.currency);
  const collectedLast = primaryTotal(payments.collectedLastMonth, history.currency);
  const outstanding = primaryTotal(payments.outstanding, history.currency);
  const { movement } = history;

  const provider = paymentProviderName();
  const webhookMissing = provider === "stripe" && !stripeWebhookConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Recurring revenue over time, what&apos;s been collected, and what&apos;s
          still owed.
        </p>
      </div>

      {/* Payment mode is worth saying out loud on the page about money. */}
      {webhookMissing ? (
        <Banner tone="warn">
          <strong className="font-semibold">Stripe keys are live, but no webhook secret is set.</strong>{" "}
          Payment links will work and nothing will be recorded when they&apos;re
          paid. Set <code>STRIPE_WEBHOOK_SECRET</code> and register{" "}
          <code>/api/stripe/webhook</code> in the Stripe dashboard.
        </Banner>
      ) : provider === "mock" ? (
        <Banner tone="info">
          <strong className="font-semibold">Payments are simulated.</strong> Links
          open an in-app checkout that runs the full flow — service goes active,
          bill date rolls, payment recorded — without moving money. Add{" "}
          <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> to
          switch to real Stripe; nothing else changes.
        </Banner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatMoney(revenue.mrrCents, revenue.currency)}
          accent
          hint={`ARR ${formatMoney(revenue.arrCents, revenue.currency)}`}
        />
        <StatCard
          label="Collected this month"
          value={formatMoney(collected.mrrCents + collected.oneOffCents, collected.currency)}
          hint={`Last month ${formatMoney(
            collectedLast.mrrCents + collectedLast.oneOffCents,
            collectedLast.currency,
          )}`}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding.mrrCents + outstanding.oneOffCents, outstanding.currency)}
          hint={`${payments.outstandingLines} line${
            payments.outstandingLines === 1 ? "" : "s"
          } awaiting payment`}
        />
        <StatCard
          label="Net new MRR"
          value={`${movement.netCents >= 0 ? "+" : "−"}${formatMoney(
            Math.abs(movement.netCents),
            movement.currency,
          )}`}
          hint="This month, new minus churned"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="MRR"
          subtitle="Last 12 months"
          className="lg:col-span-2"
        >
          <MrrTrend points={history.points} />
        </SectionCard>

        <SectionCard title="This month" subtitle="Movement">
          <dl className="flex flex-col gap-4">
            <Movement
              label="New MRR"
              value={formatMoney(movement.newCents, movement.currency)}
              hint={`${movement.newLines} line${movement.newLines === 1 ? "" : "s"} started`}
              tone="up"
            />
            <Movement
              label="Churned MRR"
              value={`−${formatMoney(movement.churnedCents, movement.currency)}`}
              hint={`${movement.churnedLines} line${
                movement.churnedLines === 1 ? "" : "s"
              } cancelled`}
              tone="down"
            />
            <Movement
              label="Net"
              value={`${movement.netCents >= 0 ? "+" : "−"}${formatMoney(
                Math.abs(movement.netCents),
                movement.currency,
              )}`}
              hint={
                history.recordedMonths > 1
                  ? `${history.recordedMonths} months recorded`
                  : "History starts building from today"
              }
              tone={movement.netCents >= 0 ? "up" : "down"}
            />
          </dl>
        </SectionCard>

        <SectionCard
          title="Revenue by service"
          subtitle="Monthly equivalent"
          className="lg:col-span-2"
          action={
            <Link
              href="/admin/services"
              className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
            >
              Catalogue →
            </Link>
          }
        >
          <RevenueBars data={summary.byService} />
        </SectionCard>

        <SectionCard title="Upcoming bills" subtitle="Next 30 days">
          {summary.upcoming.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">Nothing scheduled.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {summary.upcoming.map((bill) => (
                <li key={bill.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/admin/clients/${bill.clientId}`} className="group block">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm group-hover:text-[var(--admin-accent)]">
                        {bill.clientName}
                      </span>
                      <Money className="shrink-0 text-sm font-medium">
                        {formatMoney(bill.amountCents, bill.currency)}
                      </Money>
                    </div>
                    <p className="mt-0.5 text-xs">
                      <span className="text-[var(--admin-fg-subtle)]">{bill.label}</span>
                      <span className="text-[var(--admin-fg-subtle)]"> · </span>
                      <span
                        className={
                          bill.overdue
                            ? "font-medium text-red-500"
                            : "text-[var(--admin-fg-muted)]"
                        }
                      >
                        {bill.overdue ? "Overdue" : formatDate(bill.dueAt)}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Payments"
        subtitle={
          payments.failedRecently > 0
            ? `${payments.failedRecently} failed in the last 30 days`
            : "Newest first"
        }
        bodyClassName="p-0"
      >
        {payments.recent.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Send a payment link from a client's billing line. Once it clears, it lands here — and the service goes active on its own."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>For</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">When</Th>
              </tr>
            </thead>
            <tbody>
              {payments.recent.map((payment) => (
                <tr key={payment.id} className="transition hover:bg-[var(--admin-surface-2)]">
                  <Td>
                    <Link
                      href={`/admin/clients/${payment.clientId}`}
                      className="font-medium hover:text-[var(--admin-accent)] hover:underline"
                    >
                      {payment.clientName}
                    </Link>
                  </Td>
                  <Td className="text-[var(--admin-fg-muted)]">
                    {payment.description ?? "—"}
                    {payment.failureReason && (
                      <span className="block text-xs text-red-500">
                        {payment.failureReason}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={payment.status} />
                  </Td>
                  <Td className="text-right">
                    <Money className="font-medium">
                      {formatMoney(payment.amountCents, payment.currency)}
                    </Money>
                  </Td>
                  <Td className="whitespace-nowrap text-right text-[var(--admin-fg-subtle)]">
                    {formatDate(payment.paidAt ?? payment.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function Movement({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "up" | "down";
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd
        className="mt-0.5 text-xl font-semibold tabular-nums"
        style={{ color: `var(${tone === "up" ? "--svc-active-fg" : "--pr-high-fg"})` }}
      >
        {value}
      </dd>
      <p className="text-xs text-[var(--admin-fg-subtle)]">{hint}</p>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "info" | "warn";
  children: React.ReactNode;
}) {
  const colorVar = tone === "warn" ? "--pr-high-fg" : "--svc-pending-fg";
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm"
      style={{
        color: `var(${colorVar})`,
        borderColor: `color-mix(in srgb, var(${colorVar}) 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 10%, transparent)`,
      }}
    >
      {children}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName = "p-5",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

// Money on this page must never be a cached number.
export const dynamic = "force-dynamic";
