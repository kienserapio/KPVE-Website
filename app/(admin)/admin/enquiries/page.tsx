import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listLeads, getLeadStats } from "@/lib/dal/leads";
import { leadFiltersSchema } from "@/lib/validation";
import { formatRelative } from "@/lib/utils";
import {
  Card,
  CategoryBadge,
  EmptyState,
  PriorityBadge,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  STATUS_LABELS,
} from "@/components/admin/ui";
import { LeadFilters } from "@/components/admin/LeadFilters";
import { ExportButton } from "@/components/admin/ExportButton";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifySession();

  const params = await searchParams;
  const parsed = leadFiltersSchema.safeParse({
    status: params.status,
    category: params.category,
    q: params.q,
    page: params.page ?? 1,
  });
  const filters = parsed.success ? parsed.data : { page: 1 };

  const [stats, { items, total, page, pageCount }] = await Promise.all([
    getLeadStats(),
    listLeads(filters),
  ]);

  const hasFilters = Boolean(filters.status || filters.category || filters.q);

  const exportQuery = new URLSearchParams();
  if (filters.status) exportQuery.set("status", filters.status);
  if (filters.category) exportQuery.set("category", filters.category);
  if (filters.q) exportQuery.set("q", filters.q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Enquiries</h1>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            Every message submitted through the website.
          </p>
        </div>
        <ExportButton href={`/admin/enquiries/export?${exportQuery.toString()}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="New" value={stats.newCount} accent hint="Awaiting first contact" />
        <StatCard
          label="High priority"
          value={stats.highPriorityOpen}
          hint="Open, flagged high"
        />
        <StatCard label="This week" value={stats.thisWeek} hint="Last 7 days" />
        <StatCard label="Total" value={stats.total} hint="All time" />
      </div>

      <Card>
        <div className="border-b border-[var(--admin-border)] p-4">
          <LeadFilters
            currentStatus={filters.status}
            currentCategory={filters.category}
            currentQuery={filters.q ?? ""}
            counts={stats.byStatus}
            totalCount={stats.total}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching enquiries" : "No enquiries yet"}
            description={
              hasFilters
                ? "Try clearing the filter or searching for something else."
                : "New submissions from the website contact form will appear here."
            }
          >
            {hasFilters && (
              <Link
                href="/admin/enquiries"
                className="mt-2 text-sm font-medium text-[var(--admin-accent)] hover:underline"
              >
                Clear filters
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Enquiry</Th>
                  <Th>From</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Received</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group transition hover:bg-[var(--admin-surface-2)]"
                  >
                    {/* Topic-led: what they want and what they said, not who they
                        are. The name still opens the record, just secondary. */}
                    <Td className="max-w-[380px]">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={lead.category} />
                      </div>
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="mt-1.5 block truncate text-[var(--admin-fg)] hover:text-[var(--admin-accent)] hover:underline"
                      >
                        {lead.message}
                      </Link>
                    </Td>
                    <Td>
                      <p className="font-medium">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <a
                        href={`mailto:${lead.email}`}
                        className="mt-0.5 block truncate text-xs text-[var(--admin-fg-muted)] hover:text-[var(--admin-accent)]"
                      >
                        {lead.email}
                      </a>
                    </Td>
                    <Td>
                      <PriorityBadge priority={lead.priority} />
                    </Td>
                    <Td>
                      <StatusBadge status={lead.status} />
                    </Td>
                    <Td className="whitespace-nowrap text-right text-[var(--admin-fg-subtle)]">
                      {formatRelative(lead.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="flex items-center justify-between gap-4 p-4 text-sm text-[var(--admin-fg-muted)]">
              <p>
                {total} {total === 1 ? "enquiry" : "enquiries"}
                {filters.status ? ` · ${STATUS_LABELS[filters.status]}` : ""}
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
      href={`/admin/enquiries?${query.toString()}`}
      className="rounded-lg border border-[var(--admin-border)] px-3 py-1.5 transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
    >
      {label}
    </Link>
  );
}
