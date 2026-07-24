import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/dal/session";
import { getInvoice } from "@/lib/dal/invoices";
import { InvoiceDocument } from "@/components/admin/InvoiceDocument";
import { InvoiceActions } from "@/components/admin/InvoiceActions";

/* ---------------------------------------------------------------------------
   The staff view of one invoice: the same printable document the client sees,
   with an action bar (send / mark paid / void / delete / print / share) above
   it. The bar is `no-print`, so pressing Print here produces exactly the file
   the client gets — that equality is the whole point of P7.5.
--------------------------------------------------------------------------- */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();

  const { id } = await params;
  // Guard the shape before touching the DB — a non-UUID is a 404, not a query.
  if (!UUID_RE.test(id)) notFound();

  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <Link
          href="/admin/invoices"
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          ← Back to invoices
        </Link>
      </div>

      <InvoiceActions
        status={invoice.status}
        invoiceId={invoice.id}
        publicToken={invoice.publicToken}
        billToEmail={invoice.billToEmail}
        number={invoice.number}
        totalCents={invoice.totalCents}
        currency={invoice.currency}
        dueDate={invoice.dueDate}
      />

      <InvoiceDocument invoice={invoice} variant="admin" />
    </div>
  );
}
