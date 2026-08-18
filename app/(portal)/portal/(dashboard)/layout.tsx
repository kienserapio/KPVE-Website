import { verifyPortalSession } from "@/lib/dal/portal-session";
import { countPortalUnpaid } from "@/lib/dal/portal";
import { getPortalTheme } from "@/lib/portal-theme";
import { PortalShell } from "@/components/portal/PortalShell";

/* ---------------------------------------------------------------------------
   The signed-in half of the portal.

   A route group, so /portal, /portal/services, /portal/invoices and
   /portal/payments all get this shell while /portal/login and /portal/logout —
   siblings in the URL, but outside the group — do not. Wrapping the sign-in
   form in a shell that renders the account's name would be a neat trick.

   verifyPortalSession() here is for the CHROME, not for the gate: it supplies
   the name, the account and the unpaid count the sidebar renders. A layout does
   not re-render on navigation under Partial Rendering, so it cannot be an
   authorization boundary — every page underneath calls verifyPortalSession()
   for itself, and every read in lib/dal/portal.ts re-checks on top of that.
--------------------------------------------------------------------------- */

export default async function PortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await verifyPortalSession();
  const [theme, dueCount] = await Promise.all([getPortalTheme(), countPortalUnpaid()]);

  return (
    <PortalShell client={client} theme={theme} dueCount={dueCount}>
      {children}
    </PortalShell>
  );
}
