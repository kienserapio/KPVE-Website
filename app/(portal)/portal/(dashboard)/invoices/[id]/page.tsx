import Link from "next/link";
import { notFound } from "next/navigation";

import { getPortalInvoice } from "@/lib/dal/portal";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/billing";
import { InvoiceDocument } from "@/components/admin/InvoiceDocument";
import { PrintButton } from "@/components/admin/InvoiceActions";
import { InvoiceStatusBadge } from "@/components/admin/ui";
import { Banner } from "@/components/portal/ui";
import { PayNowButton } from "@/components/portal/PayNowButton";

/* ---------------------------------------------------------------------------
   One invoice, inside the portal.

   The same document staff see and print — InvoiceDocument in its "public"
   variant, which is the client's copy without the ATO completeness warnings
   that are staff's problem, not theirs.

   The id comes from the URL and is meaningless on its own: getPortalInvoice
   puts the session's own client_id in the WHERE, so another client's id 404s
   here in exactly the way a made-up one does. Nothing on this page reads a
   token, and the invoice's public token is never rendered — the Pay and PDF
   paths both authenticate with the session instead.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const invoice = await getPortalInvoice(id);
  if (!invoice) notFound();

  // Both decided in the DAL — see getPortalInvoice. Nothing on this page reads
  // the clock.
  const { balanceCents, overdue } = invoice;
  const isPaid = invoice.status === "paid";

  return (
    <div className="flex flex-col gap-6">
      {/* Page chrome. Dropped from the printout entirely — see the print rules
          in globals.css; what prints is the document, not the dashboard. */}
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/portal/invoices"
            className="text-xs font-medium text-[var(--admin-accent)] hover:underline"
          >
            ← All invoices
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-fg)]">
              {invoice.number}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            Issued {formatDate(invoice.issueDate)}
            {invoice.dueDate && ` · due ${formatDate(invoice.dueDate)}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/portal/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--admin-surface-2)]"
          >
            Download PDF
          </a>
          <PrintButton className="inline-flex items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--admin-surface-2)]" />

          {isPaid ? (
            <span className="inline-flex items-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--svc-active-fg)]">
              Paid — thank you
            </span>
          ) : invoice.payable ? (
            // The BALANCE, not the total: a part-paid invoice must never ask
            // for the whole thing again.
            <PayNowButton
              invoiceId={invoice.id}
              number={invoice.number}
              amountCents={balanceCents}
              currency={invoice.currency}
              dueDate={invoice.dueDate}
              coverStart={invoice.coverMonths ? invoice.coverStart : null}
              coverEnd={invoice.coverMonths ? invoice.coverEnd : null}
              partPaid={invoice.amountPaidCents > 0}
            />
          ) : null}
        </div>
      </div>

      {overdue && (
        <div className="no-print">
          <Banner
            tone="danger"
            title={`${formatMoney(balanceCents, invoice.currency)} overdue`}
          >
            This invoice was due {formatDate(invoice.dueDate as Date)}. If
            something is wrong with it, reply to the email it came with and
            we&rsquo;ll sort it out.
          </Banner>
        </div>
      )}

      {invoice.amountPaidCents > 0 && balanceCents > 0 && (
        <div className="no-print">
          <Banner
            tone="warning"
            title={`${formatMoney(invoice.amountPaidCents, invoice.currency)} already paid`}
          >
            {formatMoney(balanceCents, invoice.currency)} still outstanding on
            this invoice.
          </Banner>
        </div>
      )}

      <InvoiceDocument invoice={invoice} variant="public" />

      {!isPaid && (
        <p className="no-print text-center text-sm text-[var(--admin-fg-muted)]">
          {invoice.payable
            ? "Or pay by bank transfer using the details on the invoice above."
            : "Pay by bank transfer using the details on the invoice above."}
        </p>
      )}
    </div>
  );
}
