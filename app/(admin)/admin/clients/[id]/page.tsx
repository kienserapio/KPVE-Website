import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/dal/session";
import { getClient } from "@/lib/dal/clients";
import { listServices } from "@/lib/dal/services";
import { listActiveStaff } from "@/lib/dal/staff";
import { formatDate, formatDateTime } from "@/lib/utils";
import { formatMoney, primaryTotal } from "@/lib/billing";
import {
  Card,
  CategoryBadge,
  ClientStatusBadge,
  Money,
  PaymentStatusBadge,
} from "@/components/admin/ui";
import { ClientEditor } from "@/components/admin/ClientEditor";
import { ClientTasks } from "@/components/admin/ClientTasks";
import { ClientNotes } from "@/components/admin/ClientNotes";
import { ClientDocuments } from "@/components/admin/ClientDocuments";
import {
  ClientServices,
  RevenueSummaryStrip,
} from "@/components/admin/ClientServices";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await verifySession();

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [client, staffOptions, catalogue] = await Promise.all([
    getClient(id),
    listActiveStaff(),
    listServices(),
  ]);
  if (!client) notFound();

  const openTasks = client.tasks.filter((t) => !t.done).length;
  const activeServices = client.services.filter((s) => s.status === "active");
  const headline = primaryTotal(client.revenue);

  // Cash actually taken from this client. Only succeeded payments in the
  // headline currency — money in two currencies is two numbers, not one.
  const collected = client.payments
    .filter((p) => p.status === "succeeded" && p.currency === headline.currency)
    .reduce((sum, p) => sum + p.amountCents, 0);

  // The soonest thing to bill — the one date worth putting in the header.
  const nextBill = activeServices
    .filter((s) => s.nextBillAt)
    .sort((a, b) => a.nextBillAt!.getTime() - b.nextBillAt!.getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/clients"
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          ← Back to clients
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <ClientStatusBadge status={client.status} />
          <CategoryBadge category={client.category} />
        </div>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          {client.company ? `${client.company} · ` : ""}
          Client since {formatDateTime(client.createdAt)}
        </p>
      </div>

      {/* The money line — what this relationship is worth, before anything else. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          label="MRR"
          value={formatMoney(headline.mrrCents, headline.currency)}
          hint={headline.mixed ? "Largest currency — see breakdown below" : "Recurring, per month"}
          accent
        />
        <SummaryTile
          label="ARR"
          value={formatMoney(headline.arrCents, headline.currency)}
          hint="MRR × 12"
        />
        <SummaryTile
          label="Services"
          value={String(activeServices.length)}
          hint={
            client.services.length > activeServices.length
              ? `${client.services.length - activeServices.length} not active`
              : "Active lines"
          }
        />
        <SummaryTile
          label="Next bill"
          value={nextBill?.nextBillAt ? formatDate(nextBill.nextBillAt) : "—"}
          hint={nextBill ? nextBill.label : "Nothing scheduled"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  Services &amp; billing
                </h2>
                <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                  Everything this client pays for. One line each.
                </p>
              </div>
              <Link
                href="/admin/services"
                className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
              >
                Manage catalogue →
              </Link>
            </div>

            {client.revenue.length > 1 && (
              <div className="mt-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4">
                <RevenueSummaryStrip totals={client.revenue} />
              </div>
            )}

            <div className="mt-5">
              <ClientServices
                clientId={client.id}
                clientName={client.name}
                clientEmail={client.email}
                services={client.services}
                catalogue={catalogue}
              />
            </div>
          </Card>

          {client.payments.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  Payments
                </h2>
                <span className="text-xs text-[var(--admin-fg-subtle)]">
                  {formatMoney(collected, headline.currency)} collected
                </span>
              </div>
              <ul className="mt-4 flex flex-col divide-y divide-[var(--admin-border)]">
                {client.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                  >
                    <PaymentStatusBadge status={payment.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--admin-fg)]">
                      {payment.description ?? "Payment"}
                    </span>
                    <span className="text-xs text-[var(--admin-fg-subtle)]">
                      {formatDate(payment.paidAt ?? payment.createdAt)}
                    </span>
                    <Money className="text-sm font-medium">
                      {formatMoney(payment.amountCents, payment.currency)}
                    </Money>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                Tasks &amp; follow-ups
              </h2>
              <span className="text-xs text-[var(--admin-fg-subtle)]">
                {openTasks} open
              </span>
            </div>
            <div className="mt-4">
              <ClientTasks clientId={client.id} tasks={client.tasks} />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  Timeline
                </h2>
                <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                  Calls, meetings and updates — dated and attributed.
                </p>
              </div>
              <span className="text-xs text-[var(--admin-fg-subtle)]">
                {client.timeline.length}{" "}
                {client.timeline.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="mt-4">
              <ClientNotes clientId={client.id} entries={client.timeline} />
            </div>
          </Card>

          <ClientEditor client={client} staffOptions={staffOptions} />
        </div>

        <div className="flex flex-col gap-6">
        <Card className="h-fit p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Contact
          </h2>
          <dl className="mt-4 flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Email</dt>
              <dd className="mt-0.5">
                <a
                  href={`mailto:${client.email}`}
                  className="break-all text-[var(--admin-accent)] hover:underline"
                >
                  {client.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Phone</dt>
              <dd className="mt-0.5">
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-[var(--admin-fg-subtle)]">Not provided</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Account owner</dt>
              <dd className="mt-0.5">
                {client.assignedStaffName ?? (
                  <span className="text-[var(--admin-fg-subtle)]">Unassigned</span>
                )}
              </dd>
            </div>
            {client.sourceLeadId && (
              <div>
                <dt className="text-xs text-[var(--admin-fg-subtle)]">Origin</dt>
                <dd className="mt-0.5">
                  <Link
                    href={`/admin/leads/${client.sourceLeadId}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    View original enquiry
                  </Link>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-[var(--admin-fg-subtle)]">Last updated</dt>
              <dd className="mt-0.5 text-[var(--admin-fg-muted)]">
                {formatDateTime(client.updatedAt)}
              </dd>
            </div>
          </dl>

          <a
            href={`mailto:${client.email}`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-medium text-[var(--admin-accent-fg)] transition hover:brightness-110"
          >
            Reply by email
          </a>
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Documents
          </h2>
          <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
            Contract, brief, signed quote — linked, not uploaded.
          </p>
          <div className="mt-4">
            <ClientDocuments clientId={client.id} documents={client.documents} />
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          accent ? "text-[var(--admin-accent)]" : "text-[var(--admin-fg)]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 truncate text-xs text-[var(--admin-fg-muted)]">{hint}</p>}
    </Card>
  );
}
