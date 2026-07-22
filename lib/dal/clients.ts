import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientTasks,
  staffUsers,
  type ClientStatus,
  type ServiceCategory,
} from "@/lib/db/schema";
import { requireSession } from "./session";
import { logActivity } from "./activity";

export const PAGE_SIZE = 25;

export type ClientListItem = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  status: ClientStatus;
  value: string | null;
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
  value: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  notes: string | null;
  sourceLeadId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tasks: ClientTaskItem[];
};

/* ---------------------------------------------------------------------------
   Reads
--------------------------------------------------------------------------- */

/** Count of not-done tasks per client, as a correlated subquery. */
const openTasksExpr = sql<number>`(
  select count(*)::int from ${clientTasks}
  where ${clientTasks.clientId} = ${clients.id} and ${clientTasks.done} = false
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

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        company: clients.company,
        email: clients.email,
        phone: clients.phone,
        category: clients.category,
        status: clients.status,
        value: clients.value,
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
  value: string | null;
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
      value: clients.value,
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
      value: clients.value,
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

  return { ...row, tasks };
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
};

export async function getClientStats(): Promise<ClientStats> {
  await requireSession();

  const [statusRows, [{ total }], [{ openTasks }]] = await Promise.all([
    db.select({ status: clients.status, n: count() }).from(clients).groupBy(clients.status),
    db.select({ total: count() }).from(clients),
    db.select({ openTasks: count() }).from(clientTasks).where(eq(clientTasks.done, false)),
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
  };
}

/* ---------------------------------------------------------------------------
   Writes
--------------------------------------------------------------------------- */

export async function createClient(input: {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  category?: ServiceCategory;
  status?: ClientStatus;
  value?: string;
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
      category: input.category ?? "general",
      status: input.status ?? "active",
      value: input.value ?? null,
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
    value?: string;
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
    "value",
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
