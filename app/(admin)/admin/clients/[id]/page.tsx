import Link from "next/link";
import { notFound } from "next/navigation";

import { verifySession } from "@/lib/dal/session";
import { getClient, listIndividualClients } from "@/lib/dal/clients";
import { listServices } from "@/lib/dal/services";
import { listActiveStaff } from "@/lib/dal/staff";
import { listClientInvoices, invoicedServiceIds } from "@/lib/dal/invoices";
import { listPortalUsers } from "@/lib/dal/portal-access";
import { getClientAutopay } from "@/lib/dal/autopay";
import { formatDate, formatDateTime } from "@/lib/utils";
import { formatMoney, primaryTotal, summarize } from "@/lib/billing";
import {
  Card,
  CategoryBadge,
  ClientStatusBadge,
  ClientTypeBadge,
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
import { ClientInvoices } from "@/components/admin/ClientInvoices";
import { ClientPortalAccess } from "@/components/admin/ClientPortalAccess";
import { ClientAutopay } from "@/components/admin/ClientAutopay";

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

  const [
    client,
    staffOptions,
    catalogue,
    parentOptions,
    invoices,
    invoicedIds,
    portalUsers,
    autopay,
  ] = await Promise.all([
      getClient(id),
      listActiveStaff(),
      listServices(),
      // This record excluded: nothing may own itself.
      listIndividualClients(id),
      // The invoices raised against this client, and which of its billing lines
      // are already on one — the latter drives the "already invoiced" tag in the
      // builder (a Set, flattened to an array below for the client component).
      listClientInvoices(id),
      invoicedServiceIds(id),
      // Who can sign in to the portal as this client. Its own read rather than
      // part of getClient(): nothing else on the page needs it, and it is the
      // one list here that is about credentials rather than about the work.
      listPortalUsers(id),
      // Same reasoning as the line above: its own read, because it is about a
      // standing permission over a card rather than about the work.
      getClientAutopay(id),
    ]);
  if (!client) notFound();

  const openTasks = client.tasks.filter((t) => !t.done).length;
  const activeServices = client.services.filter((s) => s.status === "active");
  const headline = primaryTotal(client.revenue);

  const isCompany = client.clientType === "company";

  // The businesses roll-up goes through summarize() rather than a local sum so
  // a group billed in two currencies is two numbers here as well as everywhere
  // else. Each business's MRR is already monthly, hence interval "monthly".
  const groupRevenue = primaryTotal(
    summarize(
      client.businesses.map((b) => ({
        amountCents: b.mrrCents,
        currency: b.mrrCurrency,
        interval: "monthly" as const,
      })),
    ),
  );

  const hasBillingProfile = Boolean(
    client.billingName || client.billingAbn || client.billingEmail || client.billingAddress,
  );

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
          <ClientTypeBadge type={client.clientType} />
          <CategoryBadge category={client.category} />
        </div>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          {/* On a company the name above IS the business, so the sub-line is
              the person we deal with; the free-text company field is unused. */}
          {isCompany
            ? client.contactName
              ? `${client.contactName} · `
              : ""
            : client.company
              ? `${client.company} · `
              : ""}
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
          {/* "This client has multiple businesses that we manage" — one card,
              all of them, with what each is worth. Only an individual can own
              anything, so a company never renders this. */}
          {client.businesses.length > 0 && (
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                    Businesses
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                    Companies owned by this client. Each is billed in its own name.
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[var(--admin-fg-subtle)]">
                  {client.businesses.length}{" "}
                  {client.businesses.length === 1 ? "business" : "businesses"}
                  {groupRevenue.mrrCents > 0 && (
                    <>
                      {" · "}
                      {formatMoney(groupRevenue.mrrCents, groupRevenue.currency)}/mo
                      combined
                    </>
                  )}
                </span>
              </div>

              <ul className="mt-4 flex flex-col divide-y divide-[var(--admin-border)]">
                {client.businesses.map((business) => (
                  <li
                    key={business.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                  >
                    <ClientStatusBadge status={business.status} />
                    <Link
                      href={`/admin/clients/${business.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--admin-fg)] transition hover:text-[var(--admin-accent)] hover:underline"
                    >
                      {business.name}
                    </Link>
                    {business.contactName && (
                      <span className="truncate text-xs text-[var(--admin-fg-subtle)]">
                        {business.contactName}
                      </span>
                    )}
                    <Money className="text-sm font-medium" muted={business.mrrCents === 0}>
                      {business.mrrCents > 0
                        ? `${formatMoney(business.mrrCents, business.mrrCurrency)}/mo`
                        : "—"}
                    </Money>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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

          {/* Invoices sit with the money — after Payments, above the
              operational Tasks/Timeline. Always shown: it carries its own empty
              state and the "New invoice" builder. */}
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  Invoices
                </h2>
                <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                  Tax invoices raised for this client. A draft is editable; once
                  sent it&apos;s void-and-reissue.
                </p>
              </div>
              <Link
                href="/admin/invoices"
                className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
              >
                All invoices →
              </Link>
            </div>
            <div className="mt-5">
              <ClientInvoices
                clientId={client.id}
                clientName={client.name}
                invoices={invoices}
                services={client.services.map((s) => ({
                  id: s.id,
                  label: s.label,
                  unitAmountCents: s.unitAmountCents,
                  quantity: s.quantity,
                  termCount: s.termCount,
                  amountCents: s.amountCents,
                  currency: s.currency,
                  interval: s.interval,
                  status: s.status,
                }))}
                alreadyInvoiced={Array.from(invoicedIds)}
              />
            </div>
          </Card>

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

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  Portal access
                </h2>
                <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                  Who can sign in at /portal to see their services, invoices and
                  payments.
                </p>
              </div>
              <span className="text-xs text-[var(--admin-fg-subtle)]">
                {portalUsers.length}{" "}
                {portalUsers.length === 1 ? "login" : "logins"}
              </span>
            </div>
            <div className="mt-4">
              <ClientPortalAccess clientId={client.id} users={portalUsers} />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
                  AutoPay
                </h2>
                <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                  Whether their invoices are paid automatically from a card they
                  saved.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ClientAutopay clientId={client.id} autopay={autopay} />
            </div>
          </Card>

          <ClientEditor
            client={client}
            staffOptions={staffOptions}
            parentOptions={parentOptions}
          />
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
            {client.parentClientId && client.parentName && (
              <div>
                <dt className="text-xs text-[var(--admin-fg-subtle)]">Part of</dt>
                <dd className="mt-0.5">
                  <Link
                    href={`/admin/clients/${client.parentClientId}`}
                    className="text-[var(--admin-accent)] hover:underline"
                  >
                    {client.parentName} →
                  </Link>
                </dd>
              </div>
            )}
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

        {/* Shown when there is something to show, and on every company even
            when empty — a company with no ABN is a company whose invoices
            aren't tax invoices, and that is worth saying before one is sent. */}
        {(hasBillingProfile || isCompany) && (
          <Card className="h-fit p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              Billing details
            </h2>
            <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
              What prints on an invoice. Blank falls back to the contact details.
            </p>

            {hasBillingProfile ? (
              <dl className="mt-4 flex flex-col gap-4 text-sm">
                {client.billingName && (
                  <div>
                    <dt className="text-xs text-[var(--admin-fg-subtle)]">Legal name</dt>
                    <dd className="mt-0.5">{client.billingName}</dd>
                  </div>
                )}
                {client.billingAbn && (
                  <div>
                    <dt className="text-xs text-[var(--admin-fg-subtle)]">ABN</dt>
                    <dd className="mt-0.5 tabular-nums">{client.billingAbn}</dd>
                  </div>
                )}
                {client.billingEmail && (
                  <div>
                    <dt className="text-xs text-[var(--admin-fg-subtle)]">Billing email</dt>
                    <dd className="mt-0.5">
                      <a
                        href={`mailto:${client.billingEmail}`}
                        className="break-all text-[var(--admin-accent)] hover:underline"
                      >
                        {client.billingEmail}
                      </a>
                    </dd>
                  </div>
                )}
                {client.billingAddress && (
                  <div>
                    <dt className="text-xs text-[var(--admin-fg-subtle)]">Address</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-[var(--admin-fg-muted)]">
                      {client.billingAddress}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[var(--admin-fg-muted)]">
                Nothing set — invoices will use the contact details above.
              </p>
            )}

            {isCompany && !client.billingAbn && (
              <p className="mt-4 border-t border-[var(--admin-border)] pt-4 text-xs text-[var(--admin-fg-muted)]">
                No ABN on file. An invoice without one isn&apos;t a tax invoice,
                so the client can&apos;t claim it as an expense.
              </p>
            )}
          </Card>
        )}

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
