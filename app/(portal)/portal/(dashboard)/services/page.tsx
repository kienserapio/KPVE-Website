import { listPortalServices } from "@/lib/dal/portal";
import { formatDate } from "@/lib/utils";
import {
  formatMoney,
  formatQuantityLine,
  formatRate,
  formatTerm,
  INTERVAL_NOUN,
  primaryTotal,
  summarize,
} from "@/lib/billing";
import {
  Card,
  Chip,
  EmptyState,
  ServiceStatusBadge,
  StatCard,
} from "@/components/admin/ui";
import { DueChip, PageHeader } from "@/components/portal/ui";

/* ---------------------------------------------------------------------------
   Services — "what is KPVE actually running for me, and is it still on".

   A card per line rather than a table: a service is a paragraph of facts (a
   price, a cycle, a renewal date, the domains under it), and a table row that
   can hold all of them is a table nobody can read on a phone.

   The renewal date is the load-bearing one. A client's real question is never
   "what is my MRR" — it is "when does my domain expire", and that answer needs
   a date, a countdown, and whether it happens by itself.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PortalServicesPage() {
  const services = await listPortalServices();

  const live = services.filter(
    (line) => line.status === "active" || line.status === "pending_payment",
  );
  const ended = services.filter(
    (line) => line.status === "cancelled" || line.status === "paused",
  );

  const recurring = primaryTotal(summarize(services.filter((l) => l.status === "active")));
  const nextRenewal = live
    .filter((line) => line.nextBillAt !== null)
    .sort((a, b) => (a.nextBillAt as Date).getTime() - (b.nextBillAt as Date).getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your services"
        subtitle="What we run for you, what each one costs, and when it renews."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active"
          value={services.filter((line) => line.status === "active").length}
          hint={
            services.filter((line) => line.status === "pending_payment").length > 0
              ? `${services.filter((line) => line.status === "pending_payment").length} awaiting payment`
              : "Running now"
          }
        />
        <StatCard
          label="Per month"
          value={formatMoney(recurring.mrrCents, recurring.currency)}
          accent
          hint={recurring.mixed ? `Largest currency (${recurring.currency})` : "Recurring total"}
        />
        <StatCard
          label="Per year"
          value={formatMoney(recurring.arrCents, recurring.currency)}
          hint="Monthly × 12"
        />
        <StatCard
          label="Next renewal"
          value={nextRenewal?.nextBillAt ? formatDate(nextRenewal.nextBillAt) : "—"}
          hint={nextRenewal ? nextRenewal.label : "Nothing scheduled"}
        />
      </div>

      {services.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing set up yet"
            description="Once KPVE starts a service for you it appears here with its price, its renewal date and everything provisioned under it."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {live.map((line) => (
              <ServiceCard key={line.id} line={line} />
            ))}
          </div>

          {ended.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold tracking-tight text-[var(--admin-fg-muted)]">
                Paused and cancelled
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {ended.map((line) => (
                  <ServiceCard key={line.id} line={line} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ServiceCard({
  line,
}: {
  line: Awaited<ReturnType<typeof listPortalServices>>[number];
}) {
  const ended = line.status === "cancelled";

  return (
    <Card className={ended ? "p-5 opacity-70" : "p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-[var(--admin-fg)]">
            {line.label}
          </h3>
          {/* Only when it adds something. On a single-unit, single-term line the
              breakdown IS the headline price below, and printing "$90/mo" twice
              in two sizes reads as a mistake. */}
          {(line.quantity > 1 || line.termCount > 1) && (
            <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
              {formatQuantityLine(
                line.unitAmountCents,
                line.quantity,
                line.currency,
                line.interval,
              )}
              {line.termCount > 1 &&
                ` · billed every ${formatTerm(line.interval, line.termCount)}`}
            </p>
          )}
        </div>
        <ServiceStatusBadge status={line.status} />
      </div>

      <p className="mt-4 text-2xl font-semibold tabular-nums text-[var(--admin-fg)]">
        {formatRate(line.amountCents, line.currency, line.interval, line.termCount)}
      </p>

      <dl className="mt-4 flex flex-col divide-y divide-[var(--admin-border)] border-t border-[var(--admin-border)] text-sm">
        {line.startedAt && (
          <Row label="Started">{formatDate(line.startedAt)}</Row>
        )}

        {line.status !== "cancelled" && line.nextBillAt && (
          <Row label={line.interval === "one_off" ? "Due" : "Next charge"}>
            <span className="flex flex-wrap items-baseline justify-end gap-x-2">
              <span>{formatDate(line.nextBillAt)}</span>
              <DueChip
                days={line.daysUntilRenewal}
                overdue={line.overdue}
                renewal={line.interval !== "one_off"}
              />
            </span>
          </Row>
        )}

        {line.interval !== "one_off" && line.status === "active" && (
          <Row label="Renews">
            {/* An honest answer, not a reassuring one. Only a line with a real
                subscription at the provider renews by itself; everything else
                is invoiced by a person, and saying otherwise would be a promise
                the system does not keep. */}
            {line.autoRenews
              ? `Automatically, every ${
                  line.termCount > 1
                    ? formatTerm(line.interval, line.termCount)
                    : INTERVAL_NOUN[line.interval]
                }`
              : "We invoice you each time"}
          </Row>
        )}

        {line.cancelledAt && <Row label="Cancelled">{formatDate(line.cancelledAt)}</Row>}

        {line.lastPaymentAt && (
          <Row label="Last paid">{formatDate(line.lastPaymentAt)}</Row>
        )}
      </dl>

      {line.items.length > 0 && (
        <div className="mt-4 border-t border-[var(--admin-border)] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Included
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {line.items.map((item) => (
              <Chip key={item.id}>{item.label}</Chip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
      <dt className="text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--admin-fg)]">{children}</dd>
    </div>
  );
}
