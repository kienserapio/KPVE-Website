import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listClients, getClientStats } from "@/lib/dal/clients";
import { clientFiltersSchema } from "@/lib/validation";
import { formatRelative } from "@/lib/utils";
import { formatMoney, primaryTotal } from "@/lib/billing";
import {
  Card,
  CategoryBadge,
  ClientStatusBadge,
  EmptyState,
  Money,
  StatCard,
  Table,
  Td,
  Th,
  CLIENT_STATUS_LABELS,
} from "@/components/admin/ui";
import { ClientFilters } from "@/components/admin/ClientFilters";
import { ExportButton } from "@/components/admin/ExportButton";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifySession();

  const params = await searchParams;
  const parsed = clientFiltersSchema.safeParse({
    status: params.status,
    category: params.category,
    q: params.q,
    page: params.page ?? 1,
  });
  const filters = parsed.success ? parsed.data : { page: 1 };

  const [stats, { items, total, page, pageCount }] = await Promise.all([
    getClientStats(),
    listClients(filters),
  ]);

  const hasFilters = Boolean(filters.status || filters.category || filters.q);
  const revenue = primaryTotal(stats.revenue);

  const exportQuery = new URLSearchParams();
  if (filters.status) exportQuery.set("status", filters.status);
  if (filters.category) exportQuery.set("category", filters.category);
  if (filters.q) exportQuery.set("q", filters.q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            Everyone you&apos;re working with, and what&apos;s next for each.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={`/admin/clients/export?${exportQuery.toString()}`} />
          <Link
            href="/admin/clients/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-medium text-[var(--admin-accent-fg)] transition hover:brightness-110"
          >
            + New client
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatMoney(revenue.mrrCents, revenue.currency)}
          accent
          hint={
            revenue.mixed
              ? `Largest currency (${revenue.currency})`
              : "Recurring, all active services"
          }
        />
        <StatCard label="Active" value={stats.active} hint="Currently working with" />
        <StatCard label="Open tasks" value={stats.openTasks} hint="Across all clients" />
        <StatCard label="Total" value={stats.total} hint={`${stats.prospects} prospects`} />
      </div>

      <Card>
        <div className="border-b border-[var(--admin-border)] p-4">
          <ClientFilters
            currentStatus={filters.status}
            currentCategory={filters.category}
            currentQuery={filters.q ?? ""}
            counts={stats.byStatus}
            totalCount={stats.total}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching clients" : "No clients yet"}
            description={
              hasFilters
                ? "Try clearing the filter or searching for something else."
                : "Convert a won enquiry, or add a client by hand to start tracking work."
            }
          >
            {hasFilters ? (
              <Link
                href="/admin/clients"
                className="mt-2 text-sm font-medium text-[var(--admin-accent)] hover:underline"
              >
                Clear filters
              </Link>
            ) : (
              <Link
                href="/admin/clients/new"
                className="mt-2 text-sm font-medium text-[var(--admin-accent)] hover:underline"
              >
                Add a client
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                  <Th>Open tasks</Th>
                  <Th className="text-right">MRR</Th>
                  <Th className="text-right">Updated</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((client) => (
                  <tr
                    key={client.id}
                    className="group transition hover:bg-[var(--admin-surface-2)]"
                  >
                    <Td>
                      <Link
                        href={`/admin/clients/${client.id}`}
                        className="font-medium hover:text-[var(--admin-accent)] hover:underline"
                      >
                        {client.name}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-[var(--admin-fg-subtle)]">
                        {client.company ? `${client.company} · ` : ""}
                        {client.email}
                      </p>
                    </Td>
                    <Td>
                      <CategoryBadge category={client.category} />
                    </Td>
                    <Td>
                      <ClientStatusBadge status={client.status} />
                    </Td>
                    <Td>
                      {client.openTasks > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-[var(--admin-surface-2)] px-2 py-0.5 text-xs font-medium tabular-nums text-[var(--admin-fg)]">
                          {client.openTasks}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--admin-fg-subtle)]">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {client.mrrCents > 0 ? (
                        <Money className="font-medium">
                          {formatMoney(client.mrrCents, client.mrrCurrency)}
                        </Money>
                      ) : (
                        <span className="text-xs text-[var(--admin-fg-subtle)]">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right text-[var(--admin-fg-subtle)]">
                      {formatRelative(client.updatedAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="flex items-center justify-between gap-4 p-4 text-sm text-[var(--admin-fg-muted)]">
              <p>
                {total} {total === 1 ? "client" : "clients"}
                {filters.status ? ` · ${CLIENT_STATUS_LABELS[filters.status]}` : ""}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-2">
                  <PageLink page={page - 1} filters={filters} disabled={page <= 1} label="Previous" />
                  <span className="tabular-nums">
                    {page} / {pageCount}
                  </span>
                  <PageLink
                    page={page + 1}
                    filters={filters}
                    disabled={page >= pageCount}
                    label="Next"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PageLink({
  page,
  filters,
  disabled,
  label,
}: {
  page: number;
  filters: { status?: string; category?: string; q?: string };
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-[var(--admin-border)] px-3 py-1.5 opacity-40">
        {label}
      </span>
    );
  }

  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.category) query.set("category", filters.category);
  if (filters.q) query.set("q", filters.q);
  query.set("page", String(page));

  return (
    <Link
      href={`/admin/clients?${query.toString()}`}
      className="rounded-lg border border-[var(--admin-border)] px-3 py-1.5 transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
    >
      {label}
    </Link>
  );
}
