import { getPortalInvoice } from "@/lib/dal/portal";
import { renderInvoicePdf } from "@/components/admin/InvoicePdfDocument";

/* ---------------------------------------------------------------------------
   The client's PDF download, from inside the portal.

   The third and last door onto the same document, and each has its own key:
   /admin/invoices/[id]/pdf takes a staff session, /invoice/[token]/pdf takes
   the unguessable token, and this takes the portal session. getPortalInvoice
   scopes the lookup to the client that session resolved to, so another client's
   invoice id 404s here exactly as a made-up one does.

   Existing at all is what keeps the token out of the portal's HTML. Linking to
   /invoice/<token>/pdf would have been fewer lines and would have printed a
   bearer credential into every page a client leaves open on a shared screen.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let invoice;
  try {
    invoice = await getPortalInvoice(id);
  } catch {
    // requirePortalSession throws UNAUTHORIZED rather than redirecting, which
    // is right for a route handler: a signed-out fetch for a PDF should be a
    // 401, not an HTML sign-in form served with a application/pdf intent.
    return new Response("Unauthorized", { status: 401 });
  }

  if (!invoice) return new Response("Not found", { status: 404 });

  const pdf = await renderInvoicePdf(invoice);

  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      // The document is a private record; no shared cache should hold it.
      "Cache-Control": "no-store",
    },
  });
}
