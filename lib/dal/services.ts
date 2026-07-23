import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServices,
  services,
  serviceTaskTemplates,
  type BillingInterval,
  type ClientServiceStatus,
} from "@/lib/db/schema";
import {
  monthlyCents,
  nextBillFrom,
  summarize,
  type CurrencyTotal,
} from "@/lib/billing";
import { requireSession } from "./session";
import { logActivity } from "./activity";
import { applyChecklist } from "./checklists";

/* ---------------------------------------------------------------------------
   The catalogue — what KPVE sells. Staff-managed, so adding "Emails, $11/mo"
   is a form submission rather than a migration.
--------------------------------------------------------------------------- */

export type ServiceItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultAmountCents: number;
  defaultCurrency: string;
  defaultInterval: BillingInterval;
  isActive: boolean;
  /** How many clients are on this service right now — drives "in use" copy. */
  activeClients: number;
  /** Onboarding checklist size, so the row can say "5-step checklist". */
  checklistItems: number;
  createdAt: Date;
};

/** Slug from a name, deduped by the caller against what already exists. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "service"
  );
}

const activeClientsExpr = sql<number>`(
  select count(distinct ${clientServices.clientId})::int from ${clientServices}
  where ${clientServices.serviceId} = ${services.id}
    and ${clientServices.status} = 'active'
)`;

const checklistItemsExpr = sql<number>`(
  select count(*)::int from ${serviceTaskTemplates}
  where ${serviceTaskTemplates.serviceId} = ${services.id}
)`;

export async function listServices(
  options: { includeInactive?: boolean } = {},
): Promise<ServiceItem[]> {
  await requireSession();

  return db
    .select({
      id: services.id,
      name: services.name,
      slug: services.slug,
      description: services.description,
      defaultAmountCents: services.defaultAmountCents,
      defaultCurrency: services.defaultCurrency,
      defaultInterval: services.defaultInterval,
      isActive: services.isActive,
      activeClients: activeClientsExpr,
      checklistItems: checklistItemsExpr,
      createdAt: services.createdAt,
    })
    .from(services)
    .where(options.includeInactive ? undefined : eq(services.isActive, true))
    .orderBy(desc(services.isActive), asc(services.name));
}

export async function createService(input: {
  name: string;
  description?: string;
  defaultAmountCents: number;
  defaultCurrency: string;
  defaultInterval: BillingInterval;
}): Promise<{ id: string }> {
  const staff = await requireSession();

  const [row] = await db
    .insert(services)
    .values({
      name: input.name,
      slug: await uniqueSlug(slugify(input.name)),
      description: input.description ?? null,
      defaultAmountCents: input.defaultAmountCents,
      defaultCurrency: input.defaultCurrency,
      defaultInterval: input.defaultInterval,
      createdBy: staff.id,
    })
    .returning({ id: services.id });

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "service",
    entityId: row.id,
    action: "service.created",
    metadata: { name: input.name },
  });

  return row;
}

/** Append -2, -3… until the slug is free. Names repeat; slugs can't. */
async function uniqueSlug(base: string): Promise<string> {
  const taken = await db
    .select({ slug: services.slug })
    .from(services)
    .where(sql`${services.slug} = ${base} or ${services.slug} like ${base + "-%"}`);

  if (!taken.some((r) => r.slug === base)) return base;

  const used = new Set(taken.map((r) => r.slug));
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // 500 collisions on one name is not a real case; fall through rather than loop.
  return `${base}-${taken.length + 1}`;
}

export async function updateService(
  id: string,
  patch: {
    name?: string;
    description?: string;
    defaultAmountCents?: number;
    defaultCurrency?: string;
    defaultInterval?: BillingInterval;
    isActive?: boolean;
  },
): Promise<void> {
  const staff = await requireSession();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "name",
    "description",
    "defaultAmountCents",
    "defaultCurrency",
    "defaultInterval",
    "isActive",
  ] as const) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }

  const [updated] = await db
    .update(services)
    .set(set)
    .where(eq(services.id, id))
    .returning({ id: services.id });

  if (!updated) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "service",
    entityId: id,
    action: "service.updated",
    metadata: { changed: Object.keys(patch) },
  });
}

/**
 * Deleting a catalogue entry is safe: `client_services.service_id` is ON DELETE
 * SET NULL and every billable line carries its own copied label and amount, so
 * clients keep billing exactly what they were billing.
 */
export async function deleteService(id: string): Promise<void> {
  const staff = await requireSession();

  const [deleted] = await db
    .delete(services)
    .where(eq(services.id, id))
    .returning({ id: services.id, name: services.name });

  if (!deleted) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "service",
    entityId: id,
    action: "service.deleted",
    metadata: { name: deleted.name },
  });
}

/* ---------------------------------------------------------------------------
   Client services — the billable lines on one client
--------------------------------------------------------------------------- */

export type ClientServiceItem = {
  id: string;
  serviceId: string | null;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  status: ClientServiceStatus;
  startedAt: Date | null;
  nextBillAt: Date | null;
  notes: string | null;
  /** Computed server-side so the client component never calls Date.now(). */
  overdue: boolean;
  /* Payment-link state — see lib/dal/payments.ts. */
  checkoutUrl: string | null;
  checkoutCreatedAt: Date | null;
  paymentProvider: string | null;
  lastPaymentAt: Date | null;
  externalSubscriptionId: string | null;
  createdAt: Date;
};

export async function listClientServices(clientId: string): Promise<ClientServiceItem[]> {
  await requireSession();

  const rows = await db
    .select({
      id: clientServices.id,
      serviceId: clientServices.serviceId,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      status: clientServices.status,
      startedAt: clientServices.startedAt,
      nextBillAt: clientServices.nextBillAt,
      notes: clientServices.notes,
      checkoutUrl: clientServices.checkoutUrl,
      checkoutCreatedAt: clientServices.checkoutCreatedAt,
      paymentProvider: clientServices.paymentProvider,
      lastPaymentAt: clientServices.lastPaymentAt,
      externalSubscriptionId: clientServices.externalSubscriptionId,
      createdAt: clientServices.createdAt,
    })
    .from(clientServices)
    .where(eq(clientServices.clientId, clientId))
    // Live lines first, then soonest to bill, then newest.
    .orderBy(
      sql`case when ${clientServices.status} in ('active','pending_payment') then 0 else 1 end`,
      sql`${clientServices.nextBillAt} asc nulls last`,
      desc(clientServices.createdAt),
    );

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    overdue:
      row.status === "active" && row.nextBillAt
        ? row.nextBillAt.getTime() < now
        : false,
  }));
}

/** Per-currency MRR/ARR/one-off for one client. Only `active` lines count. */
export function summarizeClientServices(items: ClientServiceItem[]): CurrencyTotal[] {
  return summarize(items.filter((i) => i.status === "active"));
}

export async function addClientService(input: {
  clientId: string;
  serviceId?: string;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  status: ClientServiceStatus;
  startedAt?: Date;
  notes?: string;
}): Promise<{ id: string; tasksCreated: number }> {
  const staff = await requireSession();

  // Guard the FK so a stale client id is a 404, not a 500.
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  const startedAt = input.startedAt ?? new Date();

  const [row] = await db
    .insert(clientServices)
    .values({
      clientId: input.clientId,
      serviceId: input.serviceId ?? null,
      label: input.label,
      amountCents: input.amountCents,
      currency: input.currency,
      interval: input.interval,
      status: input.status,
      startedAt,
      nextBillAt: nextBillFrom(startedAt, input.interval),
      notes: input.notes ?? null,
      createdBy: staff.id,
    })
    .returning({ id: clientServices.id });

  await touchClient(input.clientId);

  // Onboarding checklist: attaching a service creates the things we owe them.
  // Only for a catalogue service — a bespoke line has no template behind it.
  const tasksCreated = input.serviceId
    ? await applyChecklist({
        clientId: input.clientId,
        serviceId: input.serviceId,
        startedAt,
        createdBy: staff.id,
      })
    : 0;

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: input.clientId,
    action: "client_service.added",
    metadata: {
      clientServiceId: row.id,
      label: input.label,
      amountCents: input.amountCents,
      currency: input.currency,
      interval: input.interval,
      tasksCreated,
    },
  });

  return { ...row, tasksCreated };
}

export async function updateClientService(
  id: string,
  patch: {
    label?: string;
    amountCents?: number;
    currency?: string;
    interval?: BillingInterval;
    status?: ClientServiceStatus;
    startedAt?: Date;
    nextBillAt?: Date;
    notes?: string;
  },
): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of [
    "label",
    "amountCents",
    "currency",
    "interval",
    "status",
    "startedAt",
    "nextBillAt",
    "notes",
  ] as const) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }

  // Cancelling stamps the date and stops the billing clock; un-cancelling clears
  // both, so a resumed line doesn't keep a stale cancellation on the record.
  if (patch.status === "cancelled") {
    set.cancelledAt = new Date();
    set.nextBillAt = null;
  } else if (patch.status) {
    set.cancelledAt = null;
  }

  const [row] = await db
    .update(clientServices)
    .set(set)
    .where(eq(clientServices.id, id))
    .returning({
      clientId: clientServices.clientId,
      startedAt: clientServices.startedAt,
      interval: clientServices.interval,
      status: clientServices.status,
      nextBillAt: clientServices.nextBillAt,
    });

  if (!row) throw new Error("NOT_FOUND");

  // Changing the interval (or reviving a cancelled line) invalidates the old
  // due date — recompute unless the caller set one explicitly.
  const needsRecompute =
    patch.nextBillAt === undefined &&
    (patch.interval !== undefined || (patch.status && patch.status !== "cancelled"));

  if (needsRecompute && row.status !== "cancelled") {
    const next = nextBillFrom(row.startedAt ?? new Date(), row.interval);
    if (next?.getTime() !== row.nextBillAt?.getTime()) {
      await db
        .update(clientServices)
        .set({ nextBillAt: next })
        .where(eq(clientServices.id, id));
    }
  }

  await touchClient(row.clientId);

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "client_service.updated",
    metadata: { clientServiceId: id, changed: Object.keys(patch) },
  });

  return { clientId: row.clientId };
}

/**
 * "Mark billed" — roll the due date forward one cycle. The button the team
 * actually presses each month, and the reason next_bill_at stays honest.
 */
export async function markClientServiceBilled(id: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [line] = await db
    .select({
      clientId: clientServices.clientId,
      interval: clientServices.interval,
      nextBillAt: clientServices.nextBillAt,
      label: clientServices.label,
    })
    .from(clientServices)
    .where(eq(clientServices.id, id))
    .limit(1);

  if (!line) throw new Error("NOT_FOUND");
  // A one-off has no next cycle to roll to, so there is nothing to mark. The UI
  // hides the button for one-offs; this guards the action being POSTed anyway.
  if (line.interval === "one_off") throw new Error("NOT_RECURRING");

  // Roll from the due date, not from today — billing a few days late must not
  // push every future cycle later with it.
  const from = line.nextBillAt ?? new Date();
  await db
    .update(clientServices)
    .set({ nextBillAt: nextBillFrom(from, line.interval), updatedAt: new Date() })
    .where(eq(clientServices.id, id));

  await touchClient(line.clientId);

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: line.clientId,
    action: "client_service.billed",
    metadata: { clientServiceId: id, label: line.label },
  });

  return { clientId: line.clientId };
}

export async function removeClientService(id: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .delete(clientServices)
    .where(eq(clientServices.id, id))
    .returning({ clientId: clientServices.clientId, label: clientServices.label });

  if (!row) throw new Error("NOT_FOUND");

  await touchClient(row.clientId);

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "client_service.removed",
    metadata: { label: row.label },
  });

  return { clientId: row.clientId };
}

/** Keep the client's "last updated" honest — billing changes are changes. */
async function touchClient(clientId: string): Promise<void> {
  await db.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, clientId));
}

/* ---------------------------------------------------------------------------
   Revenue rollups — for the Overview
--------------------------------------------------------------------------- */

export type UpcomingBill = {
  id: string;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  dueAt: Date;
  overdue: boolean;
  clientId: string;
  clientName: string;
};

export type ServiceRevenue = {
  label: string;
  mrrCents: number;
  currency: string;
  clients: number;
};

export type RevenueSummary = {
  totals: CurrencyTotal[];
  activeLines: number;
  clientsBilling: number;
  byService: ServiceRevenue[];
  upcoming: UpcomingBill[];
};

const UPCOMING_WINDOW_DAYS = 30;

export async function getRevenueSummary(): Promise<RevenueSummary> {
  await requireSession();

  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + UPCOMING_WINDOW_DAYS);

  const [activeLines, upcomingRows, [{ clientsBilling }]] = await Promise.all([
    db
      .select({
        label: clientServices.label,
        serviceId: clientServices.serviceId,
        amountCents: clientServices.amountCents,
        currency: clientServices.currency,
        interval: clientServices.interval,
        clientId: clientServices.clientId,
      })
      .from(clientServices)
      .where(eq(clientServices.status, "active")),
    db
      .select({
        id: clientServices.id,
        label: clientServices.label,
        amountCents: clientServices.amountCents,
        currency: clientServices.currency,
        interval: clientServices.interval,
        nextBillAt: clientServices.nextBillAt,
        clientId: clientServices.clientId,
        clientName: clients.name,
      })
      .from(clientServices)
      .innerJoin(clients, eq(clientServices.clientId, clients.id))
      .where(
        and(
          eq(clientServices.status, "active"),
          isNotNull(clientServices.nextBillAt),
          lte(clientServices.nextBillAt, horizon),
          // Anything more than a year overdue is stale data, not a bill to chase.
          gte(clientServices.nextBillAt, new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())),
        ),
      )
      .orderBy(asc(clientServices.nextBillAt))
      .limit(12),
    db
      .select({
        clientsBilling: sql<number>`count(distinct ${clientServices.clientId})::int`,
      })
      .from(clientServices)
      .where(eq(clientServices.status, "active")),
  ]);

  const totals = summarize(activeLines);

  // Group by label rather than service id, so bespoke lines (no catalogue
  // entry) still show up in the breakdown instead of vanishing into "null".
  // Currency is part of the key — the same label billed in AUD and USD is two
  // rows, because adding those two numbers together would be a lie.
  const grouped = new Map<
    string,
    { label: string; mrrCents: number; currency: string; clients: Set<string> }
  >();
  for (const line of activeLines) {
    const currency = line.currency.toUpperCase();
    const key = `${line.label} ${currency}`;
    const entry =
      grouped.get(key) ??
      { label: line.label, mrrCents: 0, currency, clients: new Set<string>() };
    entry.mrrCents += monthlyCents(line.amountCents, line.interval);
    entry.clients.add(line.clientId);
    grouped.set(key, entry);
  }

  const byService: ServiceRevenue[] = [...grouped.values()]
    .map((v) => ({
      label: v.label,
      mrrCents: v.mrrCents,
      currency: v.currency,
      clients: v.clients.size,
    }))
    .sort((a, b) => b.mrrCents - a.mrrCents)
    .slice(0, 8);

  const nowTime = now.getTime();
  const upcoming: UpcomingBill[] = upcomingRows
    .filter((r): r is typeof r & { nextBillAt: Date } => r.nextBillAt !== null)
    .map((r) => ({
      id: r.id,
      label: r.label,
      amountCents: r.amountCents,
      currency: r.currency,
      interval: r.interval,
      dueAt: r.nextBillAt,
      overdue: r.nextBillAt.getTime() < nowTime,
      clientId: r.clientId,
      clientName: r.clientName,
    }));

  return {
    totals,
    activeLines: activeLines.length,
    clientsBilling,
    byService,
    upcoming,
  };
}

/** Count for the Services page header. */
export async function countServices(): Promise<{ total: number; active: number }> {
  await requireSession();
  const [[{ total }], [{ active }]] = await Promise.all([
    db.select({ total: count() }).from(services),
    db.select({ active: count() }).from(services).where(eq(services.isActive, true)),
  ]);
  return { total, active };
}
