import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  leads,
  clients,
  clientTasks,
  type LeadStatus,
  type ServiceCategory,
} from "@/lib/db/schema";
import { requireSession } from "./session";
import { getLeadStats, type LeadStats } from "./leads";
import { getClientStats, type ClientStats } from "./clients";

export type TimePoint = { label: string; value: number };
export type CategoryCount = { category: ServiceCategory; value: number };

export type DueTask = {
  id: string;
  title: string;
  dueAt: Date;
  overdue: boolean;
  clientId: string;
  clientName: string;
};

export type RecentLead = {
  id: string;
  firstName: string;
  lastName: string;
  category: ServiceCategory;
  status: LeadStatus;
  createdAt: Date;
};

export type DashboardData = {
  leadStats: LeadStats;
  clientStats: ClientStats;
  conversionRate: number; // whole percent, converted / all-time enquiries
  enquiriesByWeek: TimePoint[]; // last 8 weeks, oldest → newest
  leadsByCategory: CategoryCount[]; // all 8 categories, descending by count
  dueTasks: DueTask[]; // overdue + due-today, across all clients
  recentLeads: RecentLead[];
};

const WEEKS = 8;
const SERVICE_CATEGORY_ORDER: ServiceCategory[] = [
  "general",
  "design",
  "web_development",
  "hosting",
  "support",
  "business",
  "media",
  "social_media",
];

/** Monday 00:00 (local) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (monday.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  monday.setDate(monday.getDate() - offset);
  return monday;
}

const WEEK_LABEL = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });

export async function getDashboardData(): Promise<DashboardData> {
  await requireSession();

  const now = new Date();
  const thisMonday = startOfWeek(now);
  const windowStart = new Date(thisMonday);
  windowStart.setDate(windowStart.getDate() - (WEEKS - 1) * 7);

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [
    leadStats,
    clientStats,
    createdRows,
    categoryRows,
    dueRows,
    recentRows,
  ] = await Promise.all([
    getLeadStats(),
    getClientStats(),
    // Bucket in JS rather than date_trunc so week boundaries match the labels
    // we render and stay in one timezone. Volume is small for this site.
    db
      .select({ createdAt: leads.createdAt })
      .from(leads)
      .where(gte(leads.createdAt, windowStart)),
    db
      .select({ category: leads.category, n: count() })
      .from(leads)
      .groupBy(leads.category),
    db
      .select({
        id: clientTasks.id,
        title: clientTasks.title,
        dueAt: clientTasks.dueAt,
        clientId: clientTasks.clientId,
        clientName: clients.name,
      })
      .from(clientTasks)
      .innerJoin(clients, eq(clientTasks.clientId, clients.id))
      .where(
        and(
          eq(clientTasks.done, false),
          isNotNull(clientTasks.dueAt),
          lte(clientTasks.dueAt, endOfToday),
        ),
      )
      .orderBy(asc(clientTasks.dueAt))
      .limit(12),
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        category: leads.category,
        status: leads.status,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(6),
  ]);

  // --- Weekly buckets (zero-filled) ---
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - (WEEKS - 1 - i) * 7);
    return { start, label: WEEK_LABEL.format(start), value: 0 };
  });
  for (const row of createdRows) {
    const wk = startOfWeek(new Date(row.createdAt)).getTime();
    const bucket = buckets.find((b) => b.start.getTime() === wk);
    if (bucket) bucket.value += 1;
  }
  const enquiriesByWeek: TimePoint[] = buckets.map((b) => ({
    label: b.label,
    value: b.value,
  }));

  // --- Category counts (all 8, descending) ---
  const catMap = new Map<ServiceCategory, number>();
  for (const row of categoryRows) catMap.set(row.category, row.n);
  const leadsByCategory: CategoryCount[] = SERVICE_CATEGORY_ORDER.map((category) => ({
    category,
    value: catMap.get(category) ?? 0,
  })).sort((a, b) => b.value - a.value);

  const nowTime = now.getTime();
  const dueTasks: DueTask[] = dueRows
    .filter((r): r is typeof r & { dueAt: Date } => r.dueAt !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt,
      overdue: r.dueAt.getTime() < nowTime,
      clientId: r.clientId,
      clientName: r.clientName,
    }));

  const conversionRate = leadStats.total
    ? Math.round((leadStats.byStatus.converted / leadStats.total) * 100)
    : 0;

  return {
    leadStats,
    clientStats,
    conversionRate,
    enquiriesByWeek,
    leadsByCategory,
    dueTasks,
    recentLeads: recentRows,
  };
}
