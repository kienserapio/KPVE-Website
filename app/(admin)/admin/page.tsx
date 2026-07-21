import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { listLeads, getLeadStats } from "@/lib/dal/leads";
import { leadFiltersSchema } from "@/lib/validation";
import { formatRelative } from "@/lib/utils";
import {
  Card,
  EmptyState,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  STATUS_LABELS,
} from "@/components/admin/ui";
import { LeadFilters } from "@/components/admin/LeadFilters";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Pages re-verify rather than trusting the layout — layouts don't re-render
  // on navigation under Partial Rendering.
  await verifySession();

  const params = await searchParams;
  const parsed = leadFiltersSchema.safeParse({
    status: params.status,
    q: params.q,
    page: params.page ?? 1,
  });
  const filters = parsed.success ? parsed.data : { page: 1 };

  const [stats, { items, total, page, pageCount }] = await Promise.all([
    getLeadStats(),
    listLeads(filters),
  ]);

  const hasFilters = Boolean(filters.status || filters.q);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Enquiries</h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Every message submitted through the website.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="New" value={stats.newCount} accent hint="Awaiting first contact" />
        <StatCard label="This week" value={stats.thisWeek} hint="Last 7 days" />
        <StatCard label="Qualified" value={stats.byStatus.qualified} />
        <StatCard label="Total" value={stats.total} hint="All time" />
      </div>

      <Card>
        <div className="border-b border-[var(--admin-border)] p-4">
          <LeadFilters
            currentStatus={filters.status}
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
                href="/admin"
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
                  <Th>Name</Th>
                  <Th>Contact</Th>
                  <Th>Message</Th>
                  <Th>Source</Th>
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
                    <Td>
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="font-medium hover:text-[var(--admin-accent)] hover:underline"
                      >
                        {lead.firstName} {lead.lastName}
                      </Link>
                      {lead.assignedStaffName && (
                        <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                          {lead.assignedStaffName}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <a
                        href={`mailto:${lead.email}`}
                        className="text-[var(--admin-fg-muted)] hover:text-[var(--admin-accent)]"
                      >
                        {lead.email}
                      </a>
                      {lead.phone && (
                        <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
                          {lead.phone}
                        </p>
                      )}
                    </Td>
                    <Td className="max-w-[280px]">
                      <p className="truncate text-[var(--admin-fg-muted)]">
                        {lead.message}
                      </p>
                    </Td>
                    <Td>
                      <code className="rounded bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-xs text-[var(--admin-fg-subtle)]">
                        {lead.source}
                      </code>
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
                  <PageLink
                    page={page - 1}
                    filters={filters}
                    disabled={page <= 1}
                    label="Previous"
                  />
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
  filters: { status?: string; q?: string };
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
  if (filters.q) query.set("q", filters.q);
  query.set("page", String(page));

  return (
    <Link
      href={`/admin?${query.toString()}`}
      className="rounded-lg border border-[var(--admin-border)] px-3 py-1.5 transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
    >
      {label}
    </Link>
  );
}
