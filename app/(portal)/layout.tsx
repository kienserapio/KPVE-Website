import type { Metadata } from "next";

import { getPortalTheme } from "@/lib/portal-theme";

export const metadata: Metadata = {
  title: "Your account — KPVE",
  // A client's own account pages must never turn up in a search result.
  robots: { index: false, follow: false },
};

/* ---------------------------------------------------------------------------
   The client-facing surface — the CRM's design language, none of its reach.

   `data-theme` is what makes the --admin-* tokens exist at all (globals.css
   defines the whole set under the bare [data-theme] selector), and setting it
   HERE rather than inside the shell is deliberate: it must be the only one on
   the page. `body:has([data-theme="light"])` paints the overscroll area behind
   the layout, so a second, nested wrapper disagreeing with this one would leave
   a white band above a dark portal on every rubber-band scroll.

   The theme comes from the portal's OWN cookie, never `kpve_theme` — that one
   is staff-only, and a client must not be able to write anything the CRM reads.
   It defaults to light because a client usually arrives from an emailed
   invoice, and /invoice/[token] is a light sheet.

   `text-[var(--admin-fg)]` is not optional: the root body is the marketing
   black, and inheriting white text onto a light sheet is white on white.

   No auth check here. Layouts do not re-render on navigation under Partial
   Rendering, so a check in a layout is not a boundary — each page and action
   calls verifyPortalSession()/requirePortalSession() for itself. The sign-in
   page lives under this layout too, which is why the layout must not gate.
--------------------------------------------------------------------------- */

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getPortalTheme();

  return (
    <div
      data-theme={theme}
      className="min-h-screen bg-[var(--admin-bg)] text-[var(--admin-fg)]"
    >
      {children}
    </div>
  );
}
