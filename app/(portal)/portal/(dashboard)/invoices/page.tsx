import Link from "next/link";

import { groupByCurrency, listPortalInvoices, primaryAmount } from "@/lib/dal/portal";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/billing";
import {
  Card,
  EmptyState,
  InvoiceStatusBadge,
  Money,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { DueChip, PageHeader, SectionCard } from "@/components/portal/ui";
import { PayNowButton } from "@/components/portal/PayNowButton";

/* ---------------------------------------------------------------------------
   Invoices — every document KPVE has issued to this client, and the button
   that clears the ones still owing.

   Drafts and voided invoices never reach here; lib/dal/portal.ts filters them
   at the query. A draft is staff scratch space and a void is cancelled
   paperwork — neither is a thing the client was asked to pay.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalInvoicesPage() {
  const invoices = await listPortalInvoices();

  const unpaid = invoices.filter(
    (invoice) => invoice.status === "sent" && invoice.balanceCents > 0,
  );
  const owed = primaryAmount(
    groupByCurrency(
      unpaid.map((invoice) => ({
        currency: invoice.currency,
        cents: invoice.balanceCents,
      })),
    ),
  );
  const overdueCount = unpaid.filter((invoice) => invoice.overdue).length;
  const paidCount = invoices.filter((invoice) => invoice.status === "paid").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        subtitle="Everything we've billed you for. Pay by card here, or by bank transfer using the details on the invoice."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Balance due"
          value={formatMoney(owed.cents, owed.currency)}
          accent={owed.cents > 0}
          hint={
            unpaid.length === 0
              ? "Nothing outstanding"
              : `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`
          }
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          hint={overdueCount === 0 ? "Nothing late" : "Past the due date"}
        />
        <StatCard label="Paid" value={paidCount} hint="Settled in full" />
      </div>

      {unpaid.length > 0 && (
        <SectionCard title="Awaiting payment" subtitle="Soonest due first">
          <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
            {[...unpaid]
              .sort((a, b) => {
                const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
                const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
                return aDue - bDue;
              })
              .map((invoice) => (
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
                          <span>Due {formatDate(invoice.dueDate)}</span>
                          <span>·</span>
                          <DueChip
                            days={invoice.daysUntilDue}
                            overdue={invoice.overdue}
                          />
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
        </SectionCard>
      )}

      <SectionCard title="All invoices" subtitle="Newest first" bodyClassName="p-0">
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="When KPVE issues an invoice it appears here, and you can pay it by card without leaving this page."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
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
                    <Money>{formatMoney(invoice.totalCents, invoice.currency)}</Money>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {invoice.balanceCents > 0 ? (
                      <Money className="font-semibold">
                        {formatMoney(invoice.balanceCents, invoice.currency)}
                      </Money>
                    ) : (
                      <span className="text-[var(--svc-active-fg)]">Paid</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>

      {invoices.length > 0 && (
        <Card className="p-5">
          <p className="text-sm text-[var(--admin-fg-muted)]">
            Prefer to pay by bank transfer? The account details are printed on
            every invoice — open one and use the &ldquo;How to pay&rdquo; block, or
            download the PDF for your accountant.
          </p>
        </Card>
      )}
    </div>
  );
}
