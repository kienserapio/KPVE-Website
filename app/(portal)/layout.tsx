import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your account — KPVE",
  // A client's own account pages must never turn up in a search result.
  robots: { index: false, follow: false },
};

/* ---------------------------------------------------------------------------
   The client-facing sheet — the same light surface as /invoice/[token], and
   deliberately not the admin shell: no staff nav, no theme toggle, nothing
   that links into the CRM.

   `data-theme="light"` is what makes the --admin-* tokens exist at all
   (globals.css defines the whole set under the bare [data-theme] selector), and
   it is hard-coded rather than read from the kpve_theme cookie, which is
   staff-only. `text-[var(--admin-fg)]` is not optional: the root body is dark,
   and inheriting that onto a light sheet is white on white.

   No auth check here. Layouts do not re-render on navigation under Partial
   Rendering, so a check in a layout is not a boundary — each page and action
   calls verifyPortalSession()/requirePortalSession() for itself. The sign-in
   page lives under this layout too, which is why the layout must not gate.
--------------------------------------------------------------------------- */

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="light"
      className="min-h-screen bg-[var(--admin-bg)] text-[var(--admin-fg)]"
    >
      {children}
    </div>
  );
}
