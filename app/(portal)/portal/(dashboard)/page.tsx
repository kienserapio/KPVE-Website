import Link from "next/link";

import { getPortalOverview, primaryAmount } from "@/lib/dal/portal";
import { formatDate, formatRelative } from "@/lib/utils";
import {
  formatMoney,
  formatQuantityLine,
  formatRate,
  primaryTotal,
} from "@/lib/billing";
import {
  Money,
  StatCard,
  Table,
  Td,
  Th,
  InvoiceStatusBadge,
  PaymentStatusBadge,
  ServiceStatusBadge,
} from "@/components/admin/ui";
import {
  Banner,
  CardLink,
  DueChip,
  PageHeader,
  SectionCard,
} from "@/components/portal/ui";
import { PayNowButton } from "@/components/portal/PayNowButton";
import { AutopayStrip } from "@/components/portal/AutopayStrip";
import { getPortalAutopay } from "@/lib/dal/autopay";

/* ---------------------------------------------------------------------------
   The client's overview — the CRM's dashboard, answering the client's four
   questions instead of the business's.

     What do I owe?      → the balance, and the button that clears it
     When is it due?     → a date AND a countdown, on every deadline
     What am I paying for? → the live lines, and what they cost per month
     Is it still on?     → the status of each line and when it next renews

   Every number is scoped to the account in the session (see lib/dal/portal.ts).
   Nothing here takes an id from the URL, because there is no id in the URL.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalOverviewPage() {
  const [data, autopay] = await Promise.all([getPortalOverview(), getPortalAutopay()]);

  const firstName = data.client.name.split(" ")[0] || "there";
  const owed = primaryAmount(data.outstanding);
  const late = primaryAmount(data.overdue, owed.currency);
  const recurring = primaryTotal(data.recurring, owed.currency);
  const paidYear = primaryAmount(data.paidThisYear, owed.currency);

  const nextRenewal = data.upcoming[0] ?? null;
  const recentInvoices = data.invoices.slice(0, 5);
  const recentPayments = data.payments.slice(0, 5);
  // "What we're running for you" means running. A cancelled line under that
  // heading contradicts the heading; it lives on /portal/services instead.
  const runningServices = data.services.filter((line) => line.status !== "cancelled");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hello, ${firstName}`}
        subtitle={`Everything KPVE is running for ${data.client.clientName}, and what it costs.`}
      />

      {/* The one thing on the page that is asking for something. Overdue beats
          due-soon beats nothing owed — a client with a late invoice does not
          need to be told about a renewal three weeks out. */}
      {late.cents > 0 ? (
        <Banner
          tone="danger"
          title={`${formatMoney(late.cents, late.currency)} overdue`}
          action={
            data.nextInvoice && (
              <PayNowButton
                invoiceId={data.nextInvoice.id}
                number={data.nextInvoice.number}
                amountCents={data.nextInvoice.balanceCents}
                currency={data.nextInvoice.currency}
                dueDate={data.nextInvoice.dueDate}
                partPaid={data.nextInvoice.amountPaidCents > 0}
              />
            )
          }
        >
          {late.count === 1
            ? "One invoice is past its due date."
            : `${late.count} invoices are past their due date.`}{" "}
          Paying now keeps your services running without interruption.
        </Banner>
      ) : owed.cents > 0 && data.nextInvoice ? (
        <Banner
          tone="warning"
          title={`${formatMoney(owed.cents, owed.currency)} to pay`}
          action={
            <PayNowButton
              invoiceId={data.nextInvoice.id}
              number={data.nextInvoice.number}
              amountCents={data.nextInvoice.balanceCents}
              currency={data.nextInvoice.currency}
              dueDate={data.nextInvoice.dueDate}
              partPaid={data.nextInvoice.amountPaidCents > 0}
            />
          }
        >
          Invoice {data.nextInvoice.number}
          {data.nextInvoice.dueDate
            ? ` is due ${formatDate(data.nextInvoice.dueDate)}.`
            : " is awaiting payment."}
        </Banner>
      ) : (
        <Banner tone="success" title="Nothing owing">
          Your account is up to date
          {nextRenewal?.nextBillAt
            ? `. Next charge is ${formatDate(nextRenewal.nextBillAt)}.`
            : "."}
        </Banner>
      )}

      {/* Whether anything is about to leave their account by itself. Above the
          numbers, because it changes what the numbers mean. */}
      <AutopayStrip autopay={autopay} hasBalance={owed.cents > 0} />

      {/* Money first — the row this whole page exists for. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Balance due"
          value={formatMoney(owed.cents, owed.currency)}
          accent={owed.cents > 0}
          hint={
            owed.mixed
              ? `Largest currency (${owed.currency})`
              : owed.count === 0
                ? "No invoices outstanding"
                : `${owed.count} unpaid invoice${owed.count === 1 ? "" : "s"}`
          }
        />
        <StatCard
          label="Next payment due"
          value={
            data.nextInvoice?.dueDate
              ? formatDate(data.nextInvoice.dueDate)
              : data.nextInvoice
                ? "On receipt"
                : "—"
          }
          hint={
            data.nextInvoice
              ? `${data.nextInvoice.number} · ${formatMoney(
                  data.nextInvoice.balanceCents,
                  data.nextInvoice.currency,
                )}`
              : "Nothing scheduled"
          }
        />
        <StatCard
          label="Active services"
          value={data.serviceCounts.active}
          hint={
            data.serviceCounts.awaitingPayment > 0
              ? `${data.serviceCounts.awaitingPayment} awaiting payment`
              : data.serviceCounts.paused > 0
                ? `${data.serviceCounts.paused} paused`
                : "All running"
          }
        />
        <StatCard
          label="Your monthly cost"
          value={formatMoney(recurring.mrrCents, recurring.currency)}
          hint={
            recurring.mrrCents > 0
              ? `${formatMoney(recurring.arrCents, recurring.currency)} a year`
              : "No recurring services"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- What's owed ---------- */}
        <SectionCard
          title="Awaiting payment"
          subtitle="Soonest due first"
          className="lg:col-span-2"
          action={<CardLink href="/portal/invoices">All invoices</CardLink>}
        >
          {data.unpaidInvoices.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              Nothing to pay right now. Invoices appear here as soon as they are
              issued, and you can pay them by card without leaving this page.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {data.unpaidInvoices.map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="text-sm font-medium text-[var(--admin-fg)] hover:text-[var(--admin-accent)] hover:underline"
                    >
                      {invoice.number}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--admin-fg-subtle)]">
                      <span>Issued {formatDate(invoice.issueDate)}</span>
                      {invoice.dueDate && (
                        <>
                          <span>·</span>
                          <DueChip
                            days={invoice.daysUntilDue}
                            overdue={invoice.overdue}
                          />
                        </>
                      )}
                      {invoice.amountPaidCents > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            {formatMoney(
                              invoice.amountPaidCents,
                              invoice.currency,
                            )}{" "}
                            already paid
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <PayNowButton
                    invoiceId={invoice.id}
                    number={invoice.number}
                    amountCents={invoice.balanceCents}
                    currency={invoice.currency}
                    dueDate={invoice.dueDate}
                    partPaid={invoice.amountPaidCents > 0}
                    size="small"
                    className="items-end"
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* ---------- Renewals ---------- */}
        <SectionCard
          title="Coming up"
          subtitle="Next charges"
          action={<CardLink href="/portal/services">Services</CardLink>}
        >
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              No renewals scheduled.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {data.upcoming.slice(0, 6).map((line) => (
                <li key={line.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm text-[var(--admin-fg)]">
                      {line.label}
                    </p>
                    <Money className="shrink-0 text-sm font-medium">
                      {formatRate(
                        line.amountCents,
                        line.currency,
                        line.interval,
                        line.termCount,
                      )}
                    </Money>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    <span className="text-[var(--admin-fg-subtle)]">
                      {line.nextBillAt ? formatDate(line.nextBillAt) : "Not scheduled"}
                    </span>
                    <span className="text-[var(--admin-fg-subtle)]">·</span>
                    <DueChip
                      days={line.daysUntilRenewal}
                      overdue={line.overdue}
                      renewal
                    />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- Services ---------- */}
        <SectionCard
          title="What we're running for you"
          subtitle={
            data.serviceCounts.active === 1
              ? "1 active service"
              : `${data.serviceCounts.active} active services`
          }
          className="lg:col-span-2"
          action={<CardLink href="/portal/services">Details</CardLink>}
        >
          {runningServices.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              Nothing is set up yet. Once KPVE starts a service for you it
              appears here with its price and renewal date.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {runningServices.slice(0, 6).map((line) => (
                <li key={line.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--admin-fg)]">
                      {line.label}
                    </p>
                    <Money className="shrink-0 text-sm font-medium">
                      {formatRate(
                        line.amountCents,
                        line.currency,
                        line.interval,
                        line.termCount,
                      )}
                    </Money>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <ServiceStatusBadge status={line.status} />
                    <span className="text-xs text-[var(--admin-fg-subtle)]">
                      {formatQuantityLine(
                        line.unitAmountCents,
                        line.quantity,
                        line.currency,
                        line.interval,
                      )}
                    </span>
                    {line.items.length > 0 && (
                      <span className="truncate text-xs text-[var(--admin-fg-subtle)]">
                        · {line.items.map((item) => item.label).join(", ")}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* ---------- Payments ---------- */}
        <SectionCard
          title="Recent payments"
          subtitle={
            paidYear.cents > 0
              ? `${formatMoney(paidYear.cents, paidYear.currency)} this year`
              : "Nothing paid yet this year"
          }
          action={<CardLink href="/portal/payments">History</CardLink>}
        >
          {recentPayments.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              No payments recorded yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Money className="text-sm font-medium">
                      {formatMoney(payment.amountCents, payment.currency)}
                    </Money>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--admin-fg-subtle)]">
                    {payment.description ?? "Payment"} ·{" "}
                    {formatRelative(payment.paidAt ?? payment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* ---------- Invoice history ---------- */}
      <SectionCard
        title="Recent invoices"
        subtitle="Newest first"
        bodyClassName="p-0"
        action={<CardLink href="/portal/invoices">View all</CardLink>}
      >
        {recentInvoices.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[var(--admin-fg-muted)]">
            No invoices yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="transition hover:bg-[var(--admin-surface-2)]"
                >
                  <Td>
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="font-medium hover:text-[var(--admin-accent)] hover:underline"
                    >
                      {invoice.number}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-[var(--admin-fg-muted)]">
                    {formatDate(invoice.issueDate)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {invoice.dueDate ? (
                      <span
                        className={
                          invoice.overdue
                            ? "font-medium text-[var(--pr-high-fg)]"
                            : "text-[var(--admin-fg-muted)]"
                        }
                      >
                        {formatDate(invoice.dueDate)}
                      </span>
                    ) : (
                      <span className="text-[var(--admin-fg-subtle)]">—</span>
                    )}
                  </Td>
                  <Td>
                    <InvoiceStatusBadge status={invoice.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Money className="font-medium">
                      {formatMoney(invoice.totalCents, invoice.currency)}
                    </Money>
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
