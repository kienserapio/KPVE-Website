import { verifyPortalSession } from "@/lib/dal/portal-session";
import { portalLogout } from "@/lib/actions/portal-auth";
import { AdminButton, Card } from "@/components/admin/ui";

/* ---------------------------------------------------------------------------
   The client's own page. Everything on it is scoped to the account in the
   session — never to an id from the URL.

   This is the sign-in landing spot; the services, invoices and payments views
   land on top of it. It reads the session, so it can never be prerendered, and
   force-dynamic says so rather than relying on that side effect surviving a
   future refactor.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const client = await verifyPortalSession();

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-sm font-semibold tracking-tight text-[var(--admin-fg)]">
            KPVE
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--admin-fg)]">
            {client.clientName}
          </h1>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            Signed in as {client.name} · {client.email}
          </p>
        </div>

        {/* A POST, because signing out is a state change. The GET route at
            /portal/logout exists only to break a stale-cookie redirect loop. */}
        <form action={portalLogout}>
          <AdminButton type="submit" variant="secondary">
            Sign out
          </AdminButton>
        </form>
      </header>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-[var(--admin-fg)]">
          Your services and invoices
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--admin-fg-muted)]">
          This is where your active services, upcoming renewals, invoices and
          payment history will appear. They are being connected now — in the
          meantime, the invoice links KPVE emails you keep working exactly as
          they do today.
        </p>
      </Card>
    </main>
  );
}
