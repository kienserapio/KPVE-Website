import { getPortalOverview, primaryAmount } from "@/lib/dal/portal";
import { formatDate, formatDateTime } from "@/lib/utils";
import { formatMoney } from "@/lib/billing";
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
import { PageHeader, SectionCard } from "@/components/portal/ui";

/* ---------------------------------------------------------------------------
   Payments — the receipt drawer.

   Every attempt, not just the successful ones: a client who saw their card
   decline needs to find that here rather than wonder whether the money left.
   What they do NOT get is the provider's own failure string — that is written
   for staff triage ("card_declined: insufficient_funds"), it is occasionally
   wrong, and it is never the right thing to put in front of a cardholder. The
   row says the attempt failed and the invoice is still payable, which is the
   part they can act on.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalPaymentsPage() {
  const data = await getPortalOverview();

  const thisYear = primaryAmount(data.paidThisYear);
  const allTime = primaryAmount(data.paidAllTime, thisYear.currency);
  const succeeded = data.payments.filter((payment) => payment.status === "succeeded");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        subtitle="Everything you've paid us, and every attempt that didn't go through."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Paid in ${new Date().getFullYear()}`}
          value={formatMoney(thisYear.cents, thisYear.currency)}
          accent
          hint={
            thisYear.mixed
              ? `Largest currency (${thisYear.currency})`
              : `${thisYear.count} payment${thisYear.count === 1 ? "" : "s"}`
          }
        />
        <StatCard
          label="Paid all time"
          value={formatMoney(allTime.cents, allTime.currency)}
          hint="Settled payments only"
        />
        <StatCard
          label="Last payment"
          value={data.lastPaymentAt ? formatDate(data.lastPaymentAt) : "—"}
          hint={
            succeeded[0]
              ? formatMoney(succeeded[0].amountCents, succeeded[0].currency)
              : "Nothing recorded yet"
          }
        />
      </div>

      <SectionCard
        title="Payment history"
        subtitle="Newest first"
        bodyClassName="p-0"
      >
        {data.payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Card payments show up here the moment they clear, along with anything paid against an invoice."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>For</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="transition hover:bg-[var(--admin-surface-2)]"
                >
                  <Td className="whitespace-nowrap text-[var(--admin-fg-muted)]">
                    {formatDateTime(payment.paidAt ?? payment.createdAt)}
                  </Td>
                  <Td className="text-[var(--admin-fg)]">
                    {payment.description ?? "Payment"}
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={payment.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Money
                      className={
                        payment.status === "succeeded" ? "font-semibold" : undefined
                      }
                      muted={payment.status !== "succeeded"}
                    >
                      {formatMoney(payment.amountCents, payment.currency, {
                        alwaysCents: true,
                      })}
                    </Money>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      <Card className="p-5">
        <p className="text-sm text-[var(--admin-fg-muted)]">
          Card payments are handled by Stripe — your card details go to them and
          never touch KPVE&rsquo;s systems. Bank transfers are reconciled by hand
          and can take a day or two to appear here after they land.
        </p>
      </Card>
    </div>
  );
}
