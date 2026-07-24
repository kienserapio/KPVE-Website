import { verifySession } from "@/lib/dal/session";
import { getInvoice } from "@/lib/dal/invoices";
import { renderInvoicePdf } from "@/components/admin/InvoicePdfDocument";

/* ---------------------------------------------------------------------------
   The staff-side PDF download. Same auth as every admin page (verifySession
   redirects an unauthenticated browser to /login); getInvoice re-checks in the
   DAL. Returns the file inline so it opens in a tab as a preview the staff
   member can then save — the browser's viewer gives them the Save button.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await verifySession();

  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });

  const invoice = await getInvoice(id);
  if (!invoice) return new Response("Not found", { status: 404 });

  const pdf = await renderInvoicePdf(invoice);

  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
