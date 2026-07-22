import "server-only";

import { and, count, desc, eq, ilike, or, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  leads,
  staffUsers,
  type LeadStatus,
  type ServiceCategory,
  type Priority,
} from "@/lib/db/schema";
import { requireSession } from "./session";
import { logActivity } from "./activity";

export const PAGE_SIZE = 25;

export type LeadListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  message: string;
  source: string;
  status: LeadStatus;
  category: ServiceCategory;
  priority: Priority;
  assignedStaffName: string | null;
  createdAt: Date;
};

export type LeadDetail = LeadListItem & {
  assignedStaffId: string | null;
  internalNotes: string | null;
  updatedAt: Date;
};

/* ---------------------------------------------------------------------------
   Public write — called by /api/contact.

   The only unauthenticated function in this file. It writes and returns
   nothing but an id; there is no public read path into `leads`.
--------------------------------------------------------------------------- */

export async function createLead(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message: string;
  source: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(leads)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
      source: input.source,
    })
    .returning({ id: leads.id });

  await logActivity({
    actorType: "system",
    entityType: "lead",
    entityId: row.id,
    action: "lead.created",
    metadata: { source: input.source },
  });

  return row;
}

/* ---------------------------------------------------------------------------
   Authorized reads
--------------------------------------------------------------------------- */

export async function listLeads(filters: {
  status?: LeadStatus;
  category?: ServiceCategory;
  q?: string;
  page?: number;
}): Promise<{ items: LeadListItem[]; total: number; page: number; pageCount: number }> {
  await requireSession();

  const page = Math.max(1, filters.page ?? 1);

  const conditions = [];
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.category) conditions.push(eq(leads.category, filters.category));
  if (filters.q) {
    // Drizzle parameterizes these — the value is never concatenated into SQL.
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(leads.firstName, term),
        ilike(leads.lastName, term),
        ilike(leads.email, term),
        ilike(leads.message, term),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        email: leads.email,
        phone: leads.phone,
        message: leads.message,
        source: leads.source,
        status: leads.status,
        category: leads.category,
        priority: leads.priority,
        assignedStaffName: staffUsers.name,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .leftJoin(staffUsers, eq(leads.assignedStaffId, staffUsers.id))
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(leads).where(where),
  ]);

  return {
    items,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type LeadExportRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  priority: Priority;
  status: LeadStatus;
  source: string;
  assignedStaffName: string | null;
  message: string;
  createdAt: Date;
};

/** Full result set for CSV export — same filters as the list, no pagination. */
export async function exportLeads(filters: {
  status?: LeadStatus;
  category?: ServiceCategory;
  q?: string;
}): Promise<LeadExportRow[]> {
  await requireSession();

  const conditions = [];
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.category) conditions.push(eq(leads.category, filters.category));
  if (filters.q) {
    const term = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(leads.firstName, term),
        ilike(leads.lastName, term),
        ilike(leads.email, term),
        ilike(leads.message, term),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  return db
    .select({
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      category: leads.category,
      priority: leads.priority,
      status: leads.status,
      source: leads.source,
      assignedStaffName: staffUsers.name,
      message: leads.message,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(staffUsers, eq(leads.assignedStaffId, staffUsers.id))
    .where(where)
    .orderBy(desc(leads.createdAt));
}

export async function getLead(id: string): Promise<LeadDetail | null> {
  await requireSession();

  const [row] = await db
    .select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      message: leads.message,
      source: leads.source,
      status: leads.status,
      category: leads.category,
      priority: leads.priority,
      assignedStaffId: leads.assignedStaffId,
      assignedStaffName: staffUsers.name,
      internalNotes: leads.internalNotes,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .leftJoin(staffUsers, eq(leads.assignedStaffId, staffUsers.id))
    .where(eq(leads.id, id))
    .limit(1);

  return row ?? null;
}

export type LeadStats = {
  total: number;
  newCount: number;
  thisWeek: number;
  highPriorityOpen: number;
  byStatus: Record<LeadStatus, number>;
};

export async function getLeadStats(): Promise<LeadStats> {
  await requireSession();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [statusRows, [{ total }], [{ thisWeek }], [{ highPriorityOpen }]] =
    await Promise.all([
      db.select({ status: leads.status, n: count() }).from(leads).groupBy(leads.status),
      db.select({ total: count() }).from(leads),
      db.select({ thisWeek: count() }).from(leads).where(gte(leads.createdAt, weekAgo)),
      // "Open" = still in the pipeline, not won or shelved. High priority here is
      // the "chase these first" number a CRM dashboard should lead with.
      db
        .select({ highPriorityOpen: count() })
        .from(leads)
        .where(
          and(
            eq(leads.priority, "high"),
            or(
              eq(leads.status, "new"),
              eq(leads.status, "contacted"),
              eq(leads.status, "qualified"),
            ),
          ),
        ),
    ]);

  const byStatus = {
    new: 0,
    contacted: 0,
    qualified: 0,
    converted: 0,
    archived: 0,
  } as Record<LeadStatus, number>;
  for (const row of statusRows) byStatus[row.status] = row.n;

  return { total, newCount: byStatus.new, thisWeek, highPriorityOpen, byStatus };
}

/* ---------------------------------------------------------------------------
   Authorized writes
--------------------------------------------------------------------------- */

export async function updateLead(
  id: string,
  patch: {
    status?: LeadStatus;
    category?: ServiceCategory;
    priority?: Priority;
    internalNotes?: string;
    assignedStaffId?: string | null;
  },
): Promise<void> {
  const staff = await requireSession();

  const [updated] = await db
    .update(leads)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.internalNotes !== undefined
        ? { internalNotes: patch.internalNotes }
        : {}),
      ...(patch.assignedStaffId !== undefined
        ? { assignedStaffId: patch.assignedStaffId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id))
    .returning({ id: leads.id });

  if (!updated) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "lead",
    entityId: id,
    action: "lead.updated",
    metadata: { changed: Object.keys(patch) },
  });
}

/**
 * Promote a won lead into a client. Copies contact details across (so later
 * edits to the client don't rewrite the enquiry), marks the lead converted,
 * and links the two. Returns the new client id.
 *
 * Idempotent-ish: if a client already points at this lead, we return it rather
 * than minting a duplicate — a double-clicked button shouldn't fork the record.
 */
export async function convertLeadToClient(leadId: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.sourceLeadId, leadId))
    .limit(1);
  if (existing) return { clientId: existing.id };

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new Error("NOT_FOUND");

  const [client] = await db
    .insert(clients)
    .values({
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      email: lead.email,
      phone: lead.phone,
      category: lead.category,
      status: "active",
      assignedStaffId: lead.assignedStaffId,
      sourceLeadId: lead.id,
    })
    .returning({ id: clients.id });

  await db
    .update(leads)
    .set({ status: "converted", updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: client.id,
    action: "client.created",
    metadata: { fromLeadId: leadId, via: "conversion" },
  });

  return { clientId: client.id };
}

export async function deleteLead(id: string): Promise<void> {
  const staff = await requireSession();

  const [deleted] = await db
    .delete(leads)
    .where(eq(leads.id, id))
    .returning({ id: leads.id, email: leads.email });

  if (!deleted) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "lead",
    entityId: id,
    action: "lead.deleted",
    metadata: { email: deleted.email },
  });
}

/** Rough count of submissions from one IP in the last hour — rate limiting. */
export async function countRecentLeadsFromEmail(email: string): Promise<number> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.email, email), gte(leads.createdAt, hourAgo)));
  return n;
}
