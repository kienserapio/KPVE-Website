import { getInvoiceByToken } from "@/lib/dal/invoices";
import { renderInvoicePdf } from "@/components/admin/InvoicePdfDocument";

/* ---------------------------------------------------------------------------
   The client's PDF download, by the unguessable token — the same "link is the
   credential" model as the public invoice page. No session: the client has no
   admin login. getInvoiceByToken validates the token shape and refuses drafts,
   so a token for something that isn't a real, issued document 404s.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invoice = await getInvoiceByToken(token);
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
