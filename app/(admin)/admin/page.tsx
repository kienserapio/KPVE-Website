import Link from "next/link";

import { verifySession } from "@/lib/dal/session";
import { getDashboardData } from "@/lib/dal/dashboard";
import { formatDate, formatRelative } from "@/lib/utils";
import { formatMoney, formatRate, primaryTotal } from "@/lib/billing";
import {
  Card,
  CategoryBadge,
  Money,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import {
  WeeklyBars,
  PipelineBars,
  CategoryBars,
  RevenueBars,
} from "@/components/admin/charts";

export default async function OverviewPage() {
  const staff = await verifySession();
  const data = await getDashboardData();

  const firstName = staff.name.split(" ")[0] || "there";
  const revenue = primaryTotal(data.revenue.totals);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
          Here&apos;s where things stand across revenue, enquiries and clients.
        </p>
      </div>

      {/* Money first — the row the business is actually run on. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={formatMoney(revenue.mrrCents, revenue.currency)}
          accent
          hint={
            revenue.mixed
              ? `Largest currency (${revenue.currency})`
              : "Recurring, per month"
          }
        />
        <StatCard
          label="ARR"
          value={formatMoney(revenue.arrCents, revenue.currency)}
          hint="MRR × 12"
        />
        <StatCard
          label="One-off booked"
          value={formatMoney(revenue.oneOffCents, revenue.currency)}
          hint="Projects, not recurring"
        />
        <StatCard
          label="Paying clients"
          value={data.revenue.clientsBilling}
          hint={`${data.revenue.activeLines} active service${
            data.revenue.activeLines === 1 ? "" : "s"
          }`}
        />
      </div>

      {/* Pipeline KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New enquiries"
          value={data.leadStats.newCount}
          hint="Awaiting first contact"
        />
        <StatCard
          label="High priority"
          value={data.leadStats.highPriorityOpen}
          hint="Open, flagged high"
        />
        <StatCard
          label="Active clients"
          value={data.clientStats.active}
          hint={`${data.clientStats.prospects} prospects`}
        />
        <StatCard
          label="Conversion rate"
          value={`${data.conversionRate}%`}
          hint="Enquiries won, all time"
        />
      </div>

      {/* Revenue detail */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Revenue by service"
          subtitle="Monthly equivalent"
          className="lg:col-span-2"
          action={<CardLink href="/admin/services">Catalogue</CardLink>}
        >
          <RevenueBars data={data.revenue.byService} />
        </SectionCard>

        <SectionCard
          title="Upcoming bills"
          subtitle="Next 30 days"
          action={<CardLink href="/admin/clients">All clients</CardLink>}
        >
          {data.revenue.upcoming.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              Nothing scheduled. Add a service to a client to start a cycle.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {data.revenue.upcoming.map((bill) => (
                <li key={bill.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/admin/clients/${bill.clientId}`} className="group block">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm text-[var(--admin-fg)] group-hover:text-[var(--admin-accent)]">
                        {bill.clientName}
                      </p>
                      <Money className="shrink-0 text-sm font-medium">
                        {formatRate(bill.amountCents, bill.currency, bill.interval)}
                      </Money>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <span className="truncate text-[var(--admin-fg-subtle)]">
                        {bill.label}
                      </span>
                      <span className="text-[var(--admin-fg-subtle)]">·</span>
                      <span
                        className={
                          bill.overdue
                            ? "shrink-0 font-medium text-red-500"
                            : "shrink-0 text-[var(--admin-fg-muted)]"
                        }
                      >
                        {bill.overdue ? "Overdue" : formatDate(bill.dueAt)}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Enquiries"
          subtitle="Last 8 weeks"
          className="lg:col-span-2"
          action={<CardLink href="/admin/enquiries">All enquiries</CardLink>}
        >
          <WeeklyBars data={data.enquiriesByWeek} />
        </SectionCard>

        <SectionCard title="Pipeline" subtitle="By status">
          <PipelineBars byStatus={data.leadStats.byStatus} />
        </SectionCard>

        <SectionCard title="By category" subtitle="What they want" className="lg:col-span-2">
          <CategoryBars data={data.leadsByCategory} />
        </SectionCard>

        <SectionCard
          title="Tasks due"
          subtitle="Overdue & today"
          action={<CardLink href="/admin/clients">All clients</CardLink>}
        >
          {data.dueTasks.length === 0 ? (
            <p className="text-sm text-[var(--admin-fg-muted)]">
              Nothing due. You&apos;re all caught up.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
              {data.dueTasks.map((task) => (
                <li key={task.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`/admin/clients/${task.clientId}`}
                    className="group block"
                  >
                    <p className="truncate text-sm text-[var(--admin-fg)] group-hover:text-[var(--admin-accent)]">
                      {task.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                      <span className="text-[var(--admin-fg-subtle)]">
                        {task.clientName}
                      </span>
                      <span className="text-[var(--admin-fg-subtle)]">·</span>
                      <span
                        className={
                          task.overdue
                            ? "font-medium text-red-500"
                            : "text-[var(--admin-fg-muted)]"
                        }
                      >
                        {task.overdue ? "Overdue" : "Today"}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Recent enquiries */}
      <SectionCard
        title="Recent enquiries"
        subtitle="Newest first"
        bodyClassName="p-0"
        action={<CardLink href="/admin/enquiries">View all</CardLink>}
      >
        {data.recentLeads.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[var(--admin-fg-muted)]">
            No enquiries yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th className="text-right">Received</Th>
              </tr>
            </thead>
            <tbody>
              {data.recentLeads.map((lead) => (
                <tr key={lead.id} className="transition hover:bg-[var(--admin-surface-2)]">
                  <Td>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="font-medium hover:text-[var(--admin-accent)] hover:underline"
                    >
                      {lead.firstName} {lead.lastName}
                    </Link>
                  </Td>
                  <Td>
                    <CategoryBadge category={lead.category} />
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
        )}
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName = "p-5",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] p-5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
    >
      {children} →
    </Link>
  );
}

// The dashboard reflects live counts on every visit.
export const dynamic = "force-dynamic";
