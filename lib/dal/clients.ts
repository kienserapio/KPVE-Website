import "server-only";

import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db";
import {
  clients,
  clientServices,
  clientTasks,
  staffUsers,
  type ClientStatus,
  type ClientType,
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
  /** Person or business. On a company, `name` is the trading name. */
  clientType: ClientType;
  /** The human at a company. Null on an individual, where `name` is the human. */
  contactName: string | null;
  company: string | null;
  /** The individual who owns this company, resolved to a name. */
  parentName: string | null;
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

/** One company on an individual's "Businesses" card. */
export type ClientBusinessItem = {
  id: string;
  name: string;
  status: ClientStatus;
  contactName: string | null;
  mrrCents: number;
  mrrCurrency: string;
};

export type ClientDetail = {
  id: string;
  name: string;
  clientType: ClientType;
  contactName: string | null;
  company: string | null;
  /** Set only on a company: the individual who owns it. */
  parentClientId: string | null;
  parentName: string | null;
  email: string;
  phone: string | null;
  category: ServiceCategory;
  status: ClientStatus;
  /* ---- Billing profile. All optional; blank means "use the details above". ---- */
  billingName: string | null;
  billingAbn: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  /** Pre-billing freeform "deal / value". Shown read-only where still set. */
  legacyValue: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  notes: string | null;
  sourceLeadId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The companies this individual owns. Always empty on a company. */
  businesses: ClientBusinessItem[];
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

/**
 * The `clients` row a company points at, joined to itself. Aliased so the owner
 * can be read in the same query as the client — the alternative is a second
 * round trip per row, which is the N+1 the MRR subqueries below exist to avoid.
 */
const parentClients = alias(clients, "parent_client");

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
  type?: ClientType;
  q?: string;
  page?: number;
}): Promise<{ items: ClientListItem[]; total: number; page: number; pageCount: number }> {
  await requireSession();

  const page = Math.max(1, filters.page ?? 1);

  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  if (filters.category) conditions.push(eq(clients.category, filters.category));
  if (filters.type) conditions.push(eq(clients.clientType, filters.type));
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
        clientType: clients.clientType,
        contactName: clients.contactName,
        company: clients.company,
        parentName: parentClients.name,
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
      .leftJoin(parentClients, eq(clients.parentClientId, parentClients.id))
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
  clientType: ClientType;
  contactName: string | null;
  company: string | null;
  parentName: string | null;
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
  type?: ClientType;
  q?: string;
}): Promise<ClientExportRow[]> {
  await requireSession();

  const conditions = [];
  if (filters.status) conditions.push(eq(clients.status, filters.status));
  if (filters.category) conditions.push(eq(clients.category, filters.category));
  if (filters.type) conditions.push(eq(clients.clientType, filters.type));
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
      clientType: clients.clientType,
      contactName: clients.contactName,
      company: clients.company,
      parentName: parentClients.name,
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
    .leftJoin(parentClients, eq(clients.parentClientId, parentClients.id))
    .where(where)
    .orderBy(desc(clients.updatedAt));
}

/**
 * Individual clients, for the "Owned by" picker. `excludeId` drops the client
 * being edited so the UI cannot offer a record itself as its own owner — the
 * DAL rejects it anyway, but a choice that always fails should not be offered.
 * Companies are never listed: a company cannot own a company.
 */
export async function listIndividualClients(
  excludeId?: string,
): Promise<{ id: string; name: string }[]> {
  await requireSession();

  const conditions = [eq(clients.clientType, "individual")];
  if (excludeId) conditions.push(ne(clients.id, excludeId));

  return db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.name));
}

/**
 * The companies one individual owns, each with its own MRR. Reuses the
 * correlated-subquery pattern above so a client with six businesses is still
 * one query, not seven.
 *
 * The join to the owner is load-bearing in two ways. It is the ownership
 * relation — and drizzle only qualifies column names ("clients"."id") once a
 * query has more than one table in it. Filtered with a bare `where` on a
 * single table, the subqueries above render as `client_id = id`, which
 * silently resolves against client_services and reports every business as
 * earning nothing. Do not "simplify" this back to a one-table select.
 */
async function listOwnedBusinesses(ownerId: string): Promise<ClientBusinessItem[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      contactName: clients.contactName,
      mrrCents: mrrCentsExpr,
      mrrCurrency: mrrCurrencyExpr,
    })
    .from(clients)
    .innerJoin(parentClients, eq(clients.parentClientId, parentClients.id))
    .where(eq(parentClients.id, ownerId))
    .orderBy(asc(clients.name));

  return rows.map((row) => ({
    ...row,
    mrrCurrency: row.mrrCurrency ?? DEFAULT_CURRENCY,
  }));
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  await requireSession();

  const [row] = await db
    .select({
      id: clients.id,
      name: clients.name,
      clientType: clients.clientType,
      contactName: clients.contactName,
      company: clients.company,
      parentClientId: clients.parentClientId,
      parentName: parentClients.name,
      email: clients.email,
      phone: clients.phone,
      category: clients.category,
      status: clients.status,
      billingName: clients.billingName,
      billingAbn: clients.billingAbn,
      billingEmail: clients.billingEmail,
      billingAddress: clients.billingAddress,
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
    .leftJoin(parentClients, eq(clients.parentClientId, parentClients.id))
    .where(eq(clients.id, id))
    .limit(1);

  if (!row) return null;

  const [services, timeline, documents, paymentHistory, businesses] = await Promise.all([
    listClientServices(id),
    listClientNotes(id),
    listClientDocuments(id),
    listClientPayments(id),
    // Only an individual can own anything (one level, enforced on write), so a
    // company never needs the question asked.
    row.clientType === "individual" ? listOwnedBusinesses(id) : Promise.resolve([]),
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
    businesses,
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
 * Ownership is exactly ONE level deep: an individual owns companies, and a
 * company owns nothing. There is no DB constraint for this — Postgres can't
 * express "the parent has no parent" without a trigger — so it is enforced
 * here, on the only path that writes the column.
 *
 * Why one level at all: every roll-up in the CRM (the Businesses card, the
 * group MRR total, "who do we invoice") would become a recursive CTE the
 * moment a company could own a company, for a case nobody has. One person,
 * several companies is the shape of the real client this was built for.
 *
 * Throws INVALID_PARENT rather than a generic error so the action layer can
 * say something the person filling in the form can act on.
 *
 * `clientId` is null on create: a row that doesn't exist yet can't own
 * anything, so only the parent-side checks apply.
 */
async function assertParentAllowed(clientId: string | null, parentId: string): Promise<void> {
  // Self-parenting: a cycle of length one, and the only one this shape allows.
  if (clientId && parentId === clientId) throw new Error("INVALID_PARENT");

  const [parent] = await db
    .select({
      id: clients.id,
      clientType: clients.clientType,
      parentClientId: clients.parentClientId,
    })
    .from(clients)
    .where(eq(clients.id, parentId))
    .limit(1);

  // Gone, already owned by somebody (that would be level two), or a company
  // itself — three ways of being the wrong owner, one answer to the person
  // filling in the form.
  if (!parent || parent.parentClientId !== null || parent.clientType !== "individual") {
    throw new Error("INVALID_PARENT");
  }

  if (clientId) {
    // This client already owns companies, so it cannot also be owned — that is
    // the other direction of the same one-level rule.
    const [child] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.parentClientId, clientId))
      .limit(1);
    if (child) throw new Error("INVALID_PARENT");
  }
}

/**
 * Identity only. Category, status and billing are all set afterwards on the
 * client's own page — creating a client should take fifteen seconds, and what
 * they pay for is a list, not a field on this form.
 *
 * The billing profile is accepted here because it arrives with the identity
 * when a company is entered from a signed quote, and is optional everywhere:
 * a client who needs none of it fills in none of it.
 */
export async function createClient(input: {
  name: string;
  clientType?: ClientType;
  contactName?: string | null;
  company?: string | null;
  email: string;
  phone?: string | null;
  parentClientId?: string | null;
  assignedStaffId?: string | null;
  notes?: string;
  billingName?: string | null;
  billingAbn?: string | null;
  billingEmail?: string | null;
  billingAddress?: string | null;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  const clientType = input.clientType ?? "individual";

  if (input.parentClientId) {
    // Only a business has an owner. A person is not owned by anybody.
    if (clientType !== "company") throw new Error("INVALID_PARENT");
    await assertParentAllowed(null, input.parentClientId);
  }

  const [row] = await db
    .insert(clients)
    .values({
      name: input.name,
      clientType,
      // On an individual `name` IS the person, so a contact person would be a
      // second copy of it.
      contactName: clientType === "company" ? (input.contactName ?? null) : null,
      company: input.company ?? null,
      email: input.email,
      phone: input.phone ?? null,
      parentClientId: input.parentClientId ?? null,
      assignedStaffId: input.assignedStaffId ?? null,
      notes: input.notes ?? null,
      billingName: input.billingName ?? null,
      billingAbn: input.billingAbn ?? null,
      billingEmail: input.billingEmail ?? null,
      billingAddress: input.billingAddress ?? null,
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

/**
 * Undefined means "leave it alone", null means "clear it" — which is why the
 * nullable fields are typed `string | null` rather than `string`. A cleared
 * ABN has to be able to reach the database, and `undefined` can't say that.
 *
 * Unlike createClient this does NOT null out `contactName` when the type is
 * individual: the editor keeps posting values whose field is currently hidden
 * so that flipping the type twice doesn't wipe what somebody typed, and the
 * detail page simply doesn't read a contact person off an individual.
 */
export async function updateClient(
  id: string,
  patch: {
    name?: string;
    clientType?: ClientType;
    contactName?: string | null;
    company?: string | null;
    email?: string;
    phone?: string | null;
    parentClientId?: string | null;
    category?: ServiceCategory;
    status?: ClientStatus;
    assignedStaffId?: string | null;
    notes?: string;
    billingName?: string | null;
    billingAbn?: string | null;
    billingEmail?: string | null;
    billingAddress?: string | null;
  },
): Promise<void> {
  const staff = await requireSession();

  if (patch.parentClientId) {
    // The type and the owner arrive in the same submit, so the check has to be
    // against the type that will be in force after this save, not the stored one.
    const [current] = await db
      .select({ clientType: clients.clientType })
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    if (!current) throw new Error("NOT_FOUND");

    const effectiveType = patch.clientType ?? current.clientType;
    if (effectiveType !== "company") throw new Error("INVALID_PARENT");
    await assertParentAllowed(id, patch.parentClientId);
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "clientType",
    "contactName",
    "company",
    "email",
    "phone",
    "parentClientId",
    "category",
    "status",
    "assignedStaffId",
    "notes",
    "billingName",
    "billingAbn",
    "billingEmail",
    "billingAddress",
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
