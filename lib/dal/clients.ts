import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServices,
  clientTasks,
  staffUsers,
  type ClientStatus,
  type ServiceCategory,
} from "@/lib/db/schema";
import { DEFAULT_CURRENCY, summarize } from "@/lib/billing";
import { requireSession } from "./session";
import { logActivity } from "./activity";
import {
  listClientServices,
  summarizeClientServices,
  type ClientServiceItem,
} from "./services";
import { listClientNotes, type ClientNoteItem } from "./notes";
import { listClientDocuments, type ClientDocumentItem } from "./documents";
import { listClientPayments, type PaymentItem } from "./payments";
import type { CurrencyTotal } from "@/lib/billing";

export const PAGE_SIZE = 25;

export type ClientListItem = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  status: ClientStatus;
  /** Monthly recurring revenue from this client's active services, in cents. */
  mrrCents: number;
  mrrCurrency: string;
  assignedStaffName: string | null;
  openTasks: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientTaskItem = {
  id: string;
  title: string;
  done: boolean;
  dueAt: Date | null;
  // Computed server-side so the client component stays pure (no Date.now in render).
  overdue: boolean;
  createdByName: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type ClientDetail = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  status: ClientStatus;
  /** Pre-billing freeform "deal / value". Shown read-only where still set. */
  legacyValue: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  notes: string | null;
  sourceLeadId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tasks: ClientTaskItem[];
  services: ClientServiceItem[];
  /** Per-currency rollup of the active services above. */
  revenue: CurrencyTotal[];
  /** Dated call/meeting/email entries — the relationship history. */
  timeline: ClientNoteItem[];
  documents: ClientDocumentItem[];
  /** Money actually taken, newest first. */
  payments: PaymentItem[];
};

/* ---------------------------------------------------------------------------
   Reads
--------------------------------------------------------------------------- */

/** Count of not-done tasks per client, as a correlated subquery. */
const openTasksExpr = sql<number>`(
  select count(*)::int from ${clientTasks}
  where ${clientTasks.clientId} = ${clients.id} and ${clientTasks.done} = false
)`;

/**
 * Monthly recurring revenue per client, in cents, from active services only.
 * The interval factors mirror lib/billing.ts — weekly is 52/12, not 4, and
 * one-offs are excluded because they are booked revenue, not recurring.
 * Computed in SQL so the list page stays one query instead of N+1.
 */
const mrrCentsExpr = sql<number>`(
  select coalesce(round(sum(
    case ${clientServices.interval}
      when 'weekly'    then ${clientServices.amountCents} * 52.0 / 12.0
      when 'monthly'   then ${clientServices.amountCents}
      when 'quarterly' then ${clientServices.amountCents} / 3.0
      when 'annually'  then ${clientServices.amountCents} / 12.0
      else 0
    end
  )), 0)::int
  from ${clientServices}
  where ${clientServices.clientId} = ${clients.id}
    and ${clientServices.status} = 'active'
)`;

/**
 * Which currency that number is in — the client's biggest active line. Mixing
 * currencies inside one client is rare; when it happens the detail page breaks
 * the total out properly, and this column shows the dominant one.
 */
const mrrCurrencyExpr = sql<string>`(
  select ${clientServices.currency} from ${clientServices}
  where ${clientServices.clientId} = ${clients.id}
    and ${clientServices.status} = 'active'
  order by ${clientServices.amountCents} desc
  limit 1
)`;

export async function listClients(filters: {
  status?: ClientStatus;
  category?: ServiceCategory;
  q?: string;
  page?: number;
}): Promise<{ items: ClientListItem[]; total: number; page: number; pageCount: number }> {
  await requireSession();

  const page = Math.max(1, filters.page ?? 1);

  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  if (filters.category) conditions.push(eq(clients.category, filters.category));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(clients.name, term),
        ilike(clients.company, term),
        ilike(clients.email, term),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        company: clients.company,
        email: clients.email,
        phone: clients.phone,
        category: clients.category,
        status: clients.status,
        mrrCents: mrrCentsExpr,
        mrrCurrency: mrrCurrencyExpr,
        assignedStaffName: staffUsers.name,
        openTasks: openTasksExpr,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt,
      })
      .from(clients)
      .leftJoin(staffUsers, eq(clients.assignedStaffId, staffUsers.id))
      .where(where)
      .orderBy(desc(clients.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(clients).where(where),
  ]);

  // The currency subquery returns null for a client with no active services.
  const items: ClientListItem[] = rows.map((row) => ({
    ...row,
    mrrCurrency: row.mrrCurrency ?? DEFAULT_CURRENCY,
  }));

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type ClientExportRow = {
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  status: ClientStatus;
  mrrCents: number;
  mrrCurrency: string | null;
  assignedStaffName: string | null;
  openTasks: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Full result set for CSV export — same filters as the list, no pagination. */
export async function exportClients(filters: {
  status?: ClientStatus;
  category?: ServiceCategory;
  q?: string;
}): Promise<ClientExportRow[]> {
  await requireSession();

  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  if (filters.category) conditions.push(eq(clients.category, filters.category));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(clients.name, term),
        ilike(clients.company, term),
        ilike(clients.email, term),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  return db
    .select({
      name: clients.name,
      company: clients.company,
      email: clients.email,
      phone: clients.phone,
      category: clients.category,
      status: clients.status,
      mrrCents: mrrCentsExpr,
      mrrCurrency: mrrCurrencyExpr,
      assignedStaffName: staffUsers.name,
      openTasks: openTasksExpr,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .leftJoin(staffUsers, eq(clients.assignedStaffId, staffUsers.id))
    .where(where)
    .orderBy(desc(clients.updatedAt));
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  await requireSession();

  const [row] = await db
    .select({
      id: clients.id,
      name: clients.name,
      company: clients.company,
      email: clients.email,
      phone: clients.phone,
      category: clients.category,
      status: clients.status,
      legacyValue: clients.legacyValue,
      assignedStaffId: clients.assignedStaffId,
      assignedStaffName: staffUsers.name,
      notes: clients.notes,
      sourceLeadId: clients.sourceLeadId,
      createdAt: clients.createdAt,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .leftJoin(staffUsers, eq(clients.assignedStaffId, staffUsers.id))
    .where(eq(clients.id, id))
    .limit(1);

  if (!row) return null;

  const [services, timeline, documents, paymentHistory] = await Promise.all([
    listClientServices(id),
    listClientNotes(id),
    listClientDocuments(id),
    listClientPayments(id),
  ]);

  // Open tasks first, then by due date (nulls last), then newest.
  const taskRows = await db
    .select({
      id: clientTasks.id,
      title: clientTasks.title,
      done: clientTasks.done,
      dueAt: clientTasks.dueAt,
      createdByName: staffUsers.name,
      createdAt: clientTasks.createdAt,
      completedAt: clientTasks.completedAt,
    })
    .from(clientTasks)
    .leftJoin(staffUsers, eq(clientTasks.createdBy, staffUsers.id))
    .where(eq(clientTasks.clientId, id))
    .orderBy(
      asc(clientTasks.done),
      sql`${clientTasks.dueAt} asc nulls last`,
      desc(clientTasks.createdAt),
    );

  const now = Date.now();
  const tasks: ClientTaskItem[] = taskRows.map((t) => ({
    ...t,
    overdue: !t.done && t.dueAt ? t.dueAt.getTime() < now : false,
  }));

  return {
    ...row,
    tasks,
    services,
    revenue: summarizeClientServices(services),
    timeline,
    documents,
    payments: paymentHistory,
  };
}

/** The client promoted from this lead, if any — drives the lead's convert UI. */
export async function getClientIdByLead(leadId: string): Promise<string | null> {
  await requireSession();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.sourceLeadId, leadId))
    .limit(1);
  return row?.id ?? null;
}

export type ClientStats = {
  total: number;
  active: number;
  prospects: number;
  openTasks: number;
  byStatus: Record<ClientStatus, number>;
  /** Per-currency MRR/ARR across every active service on every client. */
  revenue: CurrencyTotal[];
};

export async function getClientStats(): Promise<ClientStats> {
  await requireSession();

  const [statusRows, [{ total }], [{ openTasks }], billingRows] = await Promise.all([
    db.select({ status: clients.status, n: count() }).from(clients).groupBy(clients.status),
    db.select({ total: count() }).from(clients),
    db.select({ openTasks: count() }).from(clientTasks).where(eq(clientTasks.done, false)),
    db
      .select({
        amountCents: clientServices.amountCents,
        currency: clientServices.currency,
        interval: clientServices.interval,
      })
      .from(clientServices)
      .where(eq(clientServices.status, "active")),
  ]);

  const byStatus = {
    prospect: 0,
    active: 0,
    on_hold: 0,
    completed: 0,
    churned: 0,
  } as Record<ClientStatus, number>;
  for (const row of statusRows) byStatus[row.status] = row.n;

  return {
    total,
    active: byStatus.active,
    prospects: byStatus.prospect,
    openTasks,
    byStatus,
    revenue: summarize(billingRows),
  };
}

/* ---------------------------------------------------------------------------
   Writes
--------------------------------------------------------------------------- */

/**
 * Identity only. Category, status and billing are all set afterwards on the
 * client's own page — creating a client should take fifteen seconds, and what
 * they pay for is a list, not a field on this form.
 */
export async function createClient(input: {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  assignedStaffId?: string | null;
  notes?: string;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  const [row] = await db
    .insert(clients)
    .values({
      name: input.name,
      company: input.company ?? null,
      email: input.email,
      phone: input.phone ?? null,
      assignedStaffId: input.assignedStaffId ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: clients.id });

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.id,
    action: "client.created",
    metadata: { via: "manual" },
  });

  return row;
}

export async function updateClient(
  id: string,
  patch: {
    name?: string;
    company?: string;
    email?: string;
    phone?: string;
    category?: ServiceCategory;
    status?: ClientStatus;
    assignedStaffId?: string | null;
    notes?: string;
  },
): Promise<void> {
  const staff = await requireSession();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "company",
    "email",
    "phone",
    "category",
    "status",
    "assignedStaffId",
    "notes",
  ] as const) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }

  const [updated] = await db
    .update(clients)
    .set(set)
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  if (!updated) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: id,
    action: "client.updated",
    metadata: { changed: Object.keys(patch) },
  });
}

export async function deleteClient(id: string): Promise<void> {
  const staff = await requireSession();

  const [deleted] = await db
    .delete(clients)
    .where(eq(clients.id, id))
    .returning({ id: clients.id, email: clients.email });

  if (!deleted) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: id,
    action: "client.deleted",
    metadata: { email: deleted.email },
  });
}

/* ---------------------------------------------------------------------------
   Tasks — the "what can we do next" list on a client
--------------------------------------------------------------------------- */

export async function addTask(input: {
  clientId: string;
  title: string;
  dueAt?: Date | null;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  // Guard the FK: a task for a client that doesn't exist is a 404, not a 500.
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  const [row] = await db
    .insert(clientTasks)
    .values({
      clientId: input.clientId,
      title: input.title,
      dueAt: input.dueAt ?? null,
      createdBy: staff.id,
    })
    .returning({ id: clientTasks.id });

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: input.clientId,
    action: "task.created",
    metadata: { taskId: row.id },
  });

  return row;
}

/** Flip a task's done flag. Returns the client id so the caller can revalidate. */
export async function toggleTask(taskId: string, done: boolean): Promise<{ clientId: string }> {
  await requireSession();

  const [row] = await db
    .update(clientTasks)
    .set({ done, completedAt: done ? new Date() : null })
    .where(eq(clientTasks.id, taskId))
    .returning({ clientId: clientTasks.clientId });

  if (!row) throw new Error("NOT_FOUND");
  return row;
}

export async function deleteTask(taskId: string): Promise<{ clientId: string }> {
  await requireSession();

  const [row] = await db
    .delete(clientTasks)
    .where(eq(clientTasks.id, taskId))
    .returning({ clientId: clientTasks.clientId });

  if (!row) throw new Error("NOT_FOUND");
  return row;
}
