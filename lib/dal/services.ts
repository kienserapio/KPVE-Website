import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, max, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServiceItems,
  clientServices,
  services,
  serviceTaskTemplates,
  type BillingInterval,
  type ClientServiceStatus,
} from "@/lib/db/schema";
import {
  clampTerm,
  lineTotalCents,
  MAX_QUANTITY,
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
  /** What one unit IS — "mailbox", "seat". Null for things that aren't counted. */
  unitLabel: string | null;
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
      unitLabel: services.unitLabel,
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
  unitLabel?: string | null;
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
      unitLabel: input.unitLabel || null,
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
    /** `null` clears it — blanking the field is how "not counted" is said. */
    unitLabel?: string | null;
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
    "unitLabel",
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

/** One thing provisioned under a line — a mailbox address, a domain. */
export type ProvisionedItem = {
  id: string;
  label: string;
};

export type ClientServiceItem = {
  id: string;
  serviceId: string | null;
  label: string;
  /** The price of ONE, and how many. `amountCents` below is their product. */
  unitAmountCents: number;
  /** Cycles per charge. 1 for every line that isn't billed a term at a time. */
  termCount: number;
  quantity: number;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  status: ClientServiceStatus;
  startedAt: Date | null;
  nextBillAt: Date | null;
  notes: string | null;
  /** The addresses/domains set up under this line, in staff order. */
  items: ProvisionedItem[];
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
      unitAmountCents: clientServices.unitAmountCents,
      termCount: clientServices.termCount,
      quantity: clientServices.quantity,
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

  // Every line's provisioned items in ONE query, grouped in JS. A query per
  // line would be an N+1 on the page that already renders the whole client,
  // and the client page is the one screen the team keeps open all day.
  const itemsByLine = await loadServiceItems(rows.map((row) => row.id));

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    items: itemsByLine.get(row.id) ?? [],
    overdue:
      row.status === "active" && row.nextBillAt
        ? row.nextBillAt.getTime() < now
        : false,
  }));
}

async function loadServiceItems(
  clientServiceIds: string[],
): Promise<Map<string, ProvisionedItem[]>> {
  const byLine = new Map<string, ProvisionedItem[]>();
  // inArray with an empty list is an invalid query, and a client with no
  // billable lines is the normal state of a brand-new client.
  if (clientServiceIds.length === 0) return byLine;

  const rows = await db
    .select({
      id: clientServiceItems.id,
      clientServiceId: clientServiceItems.clientServiceId,
      label: clientServiceItems.label,
    })
    .from(clientServiceItems)
    .where(inArray(clientServiceItems.clientServiceId, clientServiceIds))
    .orderBy(asc(clientServiceItems.position), asc(clientServiceItems.createdAt));

  for (const row of rows) {
    const list = byLine.get(row.clientServiceId);
    if (list) list.push({ id: row.id, label: row.label });
    else byLine.set(row.clientServiceId, [{ id: row.id, label: row.label }]);
  }

  return byLine;
}

/** Per-currency MRR/ARR/one-off for one client. Only `active` lines count. */
export function summarizeClientServices(items: ClientServiceItem[]): CurrencyTotal[] {
  return summarize(items.filter((i) => i.status === "active"));
}

/**
 * THE INVARIANT. `client_services.amount_cents` is the LINE TOTAL and is always
 * `unit_amount_cents × quantity`.
 *
 * This is the only place that number is produced, and the only place any of
 * the three columns is assigned. Everything downstream reads `amount_cents` and
 * trusts it — the MRR SQL in lib/dal/clients.ts, summarize(), the revenue
 * snapshots, the CSV export, the Stripe `price_data`, the upcoming-bills list —
 * so a writer that moved the quantity without the total, or the total without
 * the halves, would make every one of those numbers quietly wrong with nothing
 * on screen to show it. Funnelling both writers through here is what makes
 * "they can't disagree" a property of the code rather than a habit.
 *
 * The clamps mirror lineTotalCents()'s own so the stored trio is self-
 * consistent: a quantity that got clamped on the way into the total must be
 * the quantity that gets stored, or the row contradicts itself.
 */
function priceLine(
  unitAmountCents: number,
  quantity: number,
  interval: BillingInterval,
  termCount = 1,
) {
  const unit = Math.max(Math.trunc(unitAmountCents) || 0, 0);
  const qty = Math.min(Math.max(Math.trunc(quantity) || 1, 1), MAX_QUANTITY);
  // Clamped against the interval, because the ceiling is Stripe's three-year
  // billing period and it differs per interval — 3 on annual, 36 on monthly.
  const term = clampTerm(interval, termCount);

  return {
    unitAmountCents: unit,
    quantity: qty,
    termCount: term,
    amountCents: lineTotalCents(unit, qty, term),
  };
}

export async function addClientService(input: {
  clientId: string;
  serviceId?: string;
  label: string;
  /** The price of ONE. The total is derived — see priceLine(). */
  unitAmountCents: number;
  quantity: number;
  currency: string;
  interval: BillingInterval;
  /** Cycles per charge — 2 on an annual line means "every two years". */
  termCount?: number;
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
  const priced = priceLine(
    input.unitAmountCents,
    input.quantity,
    input.interval,
    input.termCount,
  );

  const [row] = await db
    .insert(clientServices)
    .values({
      clientId: input.clientId,
      serviceId: input.serviceId ?? null,
      label: input.label,
      ...priced,
      currency: input.currency,
      interval: input.interval,
      status: input.status,
      startedAt,
      nextBillAt: nextBillFrom(startedAt, input.interval, undefined, priced.termCount),
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
      unitAmountCents: priced.unitAmountCents,
      quantity: priced.quantity,
      amountCents: priced.amountCents,
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
    /** Either half may move alone; the total is recomputed from the pair. */
    unitAmountCents?: number;
    quantity?: number;
    currency?: string;
    interval?: BillingInterval;
    termCount?: number;
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
    "currency",
    "interval",
    "status",
    "startedAt",
    "nextBillAt",
    "notes",
  ] as const) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }

  // Price and quantity are never written on their own: either one moving
  // changes the line total, so the half that wasn't supplied is read back and
  // all three columns are rewritten together by priceLine(). The case this
  // exists for is the one-click "set quantity to 4" — a quantity-only save
  // that left amount_cents at $11 would under-report this client's MRR by $33
  // a month, for as long as nobody re-saved the line.
  if (
    patch.unitAmountCents !== undefined ||
    patch.quantity !== undefined ||
    patch.termCount !== undefined ||
    // The interval caps the term, so changing it alone can force a re-clamp:
    // annual tops out at 3 cycles where monthly allows 36.
    patch.interval !== undefined
  ) {
    const [current] = await db
      .select({
        unitAmountCents: clientServices.unitAmountCents,
        quantity: clientServices.quantity,
        termCount: clientServices.termCount,
        interval: clientServices.interval,
      })
      .from(clientServices)
      .where(eq(clientServices.id, id))
      .limit(1);

    if (!current) throw new Error("NOT_FOUND");

    Object.assign(
      set,
      priceLine(
        patch.unitAmountCents ?? current.unitAmountCents,
        patch.quantity ?? current.quantity,
        patch.interval ?? current.interval,
        patch.termCount ?? current.termCount,
      ),
    );
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
      termCount: clientServices.termCount,
      status: clientServices.status,
      nextBillAt: clientServices.nextBillAt,
    });

  if (!row) throw new Error("NOT_FOUND");

  // Changing the interval (or reviving a cancelled line) invalidates the old
  // due date — recompute unless the caller set one explicitly.
  const needsRecompute =
    patch.nextBillAt === undefined &&
    (patch.interval !== undefined ||
      patch.termCount !== undefined ||
      (patch.status && patch.status !== "cancelled"));

  if (needsRecompute && row.status !== "cancelled") {
    const next = nextBillFrom(
      row.startedAt ?? new Date(),
      row.interval,
      undefined,
      row.termCount,
    );
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
 * "Mark billed" — roll the due date forward one CHARGE. On a two-year line that
 * is two years, not one: the button means "we've invoiced what was due", and
 * what was due covered the whole term.
 */
export async function markClientServiceBilled(id: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [line] = await db
    .select({
      clientId: clientServices.clientId,
      interval: clientServices.interval,
      termCount: clientServices.termCount,
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
    .set({
      nextBillAt: nextBillFrom(from, line.interval, undefined, line.termCount),
      updatedAt: new Date(),
    })
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
   Provisioned items — the four mailbox addresses behind "Emails × 4"

   Adding one deliberately does NOT bump the line's quantity. Billed quantity
   and provisioned count should agree, but a person chose that quantity, and
   moving it behind their back turns a visible mistake into an invisible one.
   The UI offers the correction instead (see ClientServices.tsx).
--------------------------------------------------------------------------- */

export async function addServiceItem(input: {
  clientServiceId: string;
  label: string;
}): Promise<{ clientId: string }> {
  const staff = await requireSession();

  // The owning client, both to guard a stale line id and because the action
  // needs it to revalidate the client page.
  const [line] = await db
    .select({ clientId: clientServices.clientId, label: clientServices.label })
    .from(clientServices)
    .where(eq(clientServices.id, input.clientServiceId))
    .limit(1);

  if (!line) throw new Error("NOT_FOUND");

  // Append. Position is staff order rather than insertion order, so the fifth
  // mailbox added in March lands at the bottom of the list where it belongs.
  const [{ highest }] = await db
    .select({ highest: max(clientServiceItems.position) })
    .from(clientServiceItems)
    .where(eq(clientServiceItems.clientServiceId, input.clientServiceId));

  const [row] = await db
    .insert(clientServiceItems)
    .values({
      clientServiceId: input.clientServiceId,
      label: input.label,
      position: (highest ?? 0) + 1,
    })
    .returning({ id: clientServiceItems.id });

  await touchClient(line.clientId);

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: line.clientId,
    action: "client_service.item_added",
    metadata: {
      clientServiceId: input.clientServiceId,
      itemId: row.id,
      line: line.label,
      label: input.label,
    },
  });

  return { clientId: line.clientId };
}

export async function removeServiceItem(id: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  // Read the owning client BEFORE deleting: the join is the only way back to
  // it, and after the delete there is nothing left to join to.
  const [item] = await db
    .select({
      label: clientServiceItems.label,
      clientServiceId: clientServiceItems.clientServiceId,
      clientId: clientServices.clientId,
    })
    .from(clientServiceItems)
    .innerJoin(clientServices, eq(clientServiceItems.clientServiceId, clientServices.id))
    .where(eq(clientServiceItems.id, id))
    .limit(1);

  if (!item) throw new Error("NOT_FOUND");

  await db.delete(clientServiceItems).where(eq(clientServiceItems.id, id));

  await touchClient(item.clientId);

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: item.clientId,
    action: "client_service.item_removed",
    metadata: { clientServiceId: item.clientServiceId, label: item.label },
  });

  return { clientId: item.clientId };
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
        termCount: clientServices.termCount,
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
    const key = `${line.label} ${currency}`;
    const entry =
      grouped.get(key) ??
      { label: line.label, mrrCents: 0, currency, clients: new Set<string>() };
    entry.mrrCents += monthlyCents(line.amountCents, line.interval, line.termCount);
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
