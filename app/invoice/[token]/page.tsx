import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getInvoiceByToken } from "@/lib/dal/invoices";
import { formatMoney } from "@/lib/billing";
import { InvoiceDocument } from "@/components/admin/InvoiceDocument";
import { PrintButton } from "@/components/admin/InvoiceActions";

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

  const canPayNow = invoice.status === "sent" && Boolean(invoice.payUrl);
  const isPaid = invoice.status === "paid";

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
            ) : canPayNow ? (
              <a
                href={invoice.payUrl!}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110"
              >
                Pay now {formatMoney(invoice.totalCents, invoice.currency)}
              </a>
            ) : null}
          </div>
        </div>

        <InvoiceDocument invoice={invoice} variant="public" />

        {/* When there's no one-click link, the document's EFT "how to pay" block
            is the instruction — say so plainly rather than leaving a dead end. */}
        {!canPayNow && !isPaid && invoice.status === "sent" && !invoice.payUrl && (
          <p className="no-print mt-6 text-center text-sm text-[var(--admin-fg-muted)]">
            Pay by bank transfer using the details on the invoice above.
          </p>
        )}
      </div>
    </main>
  );
}
