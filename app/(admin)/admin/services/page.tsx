import { verifySession } from "@/lib/dal/session";
import { listServices } from "@/lib/dal/services";
import { formatMoney } from "@/lib/billing";
import { StatCard } from "@/components/admin/ui";
import { ServiceCatalog } from "@/components/admin/ServiceCatalog";

export default async function ServicesPage() {
  await verifySession();

  // Archived entries are shown too — this is the page where you'd un-archive.
  const services = await listServices({ includeInactive: true });

  const active = services.filter((s) => s.isActive);
  const onSale = active.filter((s) => s.defaultAmountCents > 0);
  const cheapest = onSale.length
    ? Math.min(...onSale.map((s) => s.defaultAmountCents))
    : 0;
  const currency = onSale[0]?.defaultCurrency ?? "AUD";
  const clientsOnServices = services.reduce((n, s) => n + s.activeClients, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--admin-fg-muted)]">
          What KPVE charges for. Add anything — a $11/month email plan, a monthly
          retainer, a one-off build — and it becomes a one-click option when
          putting a client on it. No deploy needed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active services" value={active.length} accent />
        <StatCard
          label="Cheapest"
          value={onSale.length ? formatMoney(cheapest, currency) : "—"}
          hint="Entry price on the list"
        />
        <StatCard
          label="Client subscriptions"
          value={clientsOnServices}
          hint="Active lines across all clients"
        />
      </div>

      <ServiceCatalog services={services} />
    </div>
  );
}

export const dynamic = "force-dynamic";
