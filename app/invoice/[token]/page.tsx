import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getInvoiceByToken } from "@/lib/dal/invoices";
import { formatMoney } from "@/lib/billing";
import { InvoiceDocument } from "@/components/admin/InvoiceDocument";
import { PrintButton } from "@/components/admin/InvoiceActions";
import { PayInvoiceButton } from "./PayInvoiceButton";

/* ---------------------------------------------------------------------------
   The client's own copy of an invoice, reached by the unguessable token — the
   same "link is the credential" model as /pay/[ref]. No session: the client has
   no admin login. getInvoiceByToken already validates the token shape and hides
   drafts (a draft isn't a document yet), so adding a session check here would
   only break the one route that's meant to be public.

   It renders exactly the document staff see and print, wrapped in a plain light
   page — a client-facing sheet, not the admin shell. The InvoiceDocument is
   built on the --admin-* tokens, so the light-theme wrapper is what resolves
   them to ink-on-paper here.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  // A private invoice link must never turn up in a search result.
  robots: { index: false, follow: false },
};

// The page reflects live invoice state (sent → paid); nothing here may cache.
export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invoice = await getInvoiceByToken(token);
  // A bad, unknown, or draft token is a 404 that says nothing else — the same
  // non-enumerable behaviour as a wrong /pay ref.
  if (!invoice) notFound();

  const isPaid = invoice.status === "paid";
  const balanceDueCents = invoice.totalCents - invoice.amountPaidCents;

  return (
    <main
      data-theme="light"
      className="min-h-screen bg-[var(--admin-bg)] px-4 py-8 text-[var(--admin-fg)] sm:py-12"
    >
      <div className="mx-auto w-full max-w-[820px]">
        {/* Page chrome — pay + print. Dropped from the printout entirely. */}
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold tracking-tight text-[var(--admin-fg)]">KPVE</span>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/invoice/${token}/pdf`}
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
              // The amount on the button is the BALANCE, not the total: a
              // part-paid invoice must never ask for the whole thing again.
              <PayInvoiceButton
                token={token}
                label={`Pay now ${formatMoney(balanceDueCents, invoice.currency)}`}
              />
            ) : null}
          </div>
        </div>

        <InvoiceDocument invoice={invoice} variant="public" />

        {/* Bank transfer is always an option and is the only one on a document
            with nothing payable left — say so rather than leaving a dead end. */}
        {!isPaid && (
          <p className="no-print mt-6 text-center text-sm text-[var(--admin-fg-muted)]">
            {invoice.payable
              ? "Or pay by bank transfer using the details on the invoice above."
              : "Pay by bank transfer using the details on the invoice above."}
          </p>
        )}
      </div>
    </main>
  );
}
