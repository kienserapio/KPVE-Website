import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clientServiceItems,
  clientServices,
  invoices,
  payments,
  type BillingInterval,
  type ClientServiceStatus,
  type InvoiceStatus,
  type PaymentStatus,
} from "@/lib/db/schema";
import {
  summarize,
  type CurrencyTotal,
  DEFAULT_CURRENCY,
} from "@/lib/billing";
import { dateOnly, loadInvoiceUnchecked, type InvoiceDetail } from "./invoices";
import { requirePortalSession, type SessionClient } from "./portal-session";

/* ---------------------------------------------------------------------------
   Everything the client portal reads.

   The mirror of the staff DAL, and deliberately NOT a thin wrapper over it.
   Every read in lib/dal/{clients,services,invoices,payments}.ts opens with
   requireSession() — a STAFF session — so none of them can serve a client, and
   making them accept "either kind of session" would put the two audiences one
   forgotten branch apart. They stay separate.

   Two rules hold for every function in this file:

     1. requirePortalSession() FIRST, and the client id comes from what it
        returns. Never from a parameter, never from a URL. A page that wants
        "this client's invoices" cannot express "some other client's invoices",
        because there is no argument for it.

     2. A client sees FINISHED work only. Draft invoices and draft service lines
        are staff scratch space — they are filtered out at the query, not in the
        component, so a new page cannot leak one by forgetting.

   Void invoices are hidden too. A voided document is cancelled paperwork; the
   number is burnt and the record is kept for the audit trail, which is a staff
   concern. Showing it to the client only raises a question the portal cannot
   answer.
--------------------------------------------------------------------------- */

/** What a client is allowed to see. Everything else is staff scratch space. */
const VISIBLE_INVOICE_STATUSES: InvoiceStatus[] = ["sent", "paid"];

/** Draft lines are not yet a commitment, so they are not the client's business. */
const VISIBLE_SERVICE_STATUSES: ClientServiceStatus[] = [
  "pending_payment",
  "active",
  "paused",
  "cancelled",
];

/* ---------------------------------------------------------------------------
   Money, grouped by currency

   Same rule as lib/billing.ts: amounts in different currencies are never
   summed. Nearly every client is single-currency, so the UI shows the first
   group and says when there are others.
--------------------------------------------------------------------------- */

export type CurrencyAmount = {
  currency: string;
  cents: number;
  count: number;
};

/**
 * Roll a set of amounts up per currency. Exported because primaryAmount() takes
 * the FIRST group and calls the rest "mixed" — handing it an ungrouped list of
 * one-entry-per-invoice makes it report a single invoice's balance as the whole
 * account's, which is exactly the bug it looks least like.
 */
export function groupByCurrency(
  rows: { currency: string; cents: number }[],
): CurrencyAmount[] {
  const byCurrency = new Map<string, CurrencyAmount>();

  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    const total = byCurrency.get(currency) ?? { currency, cents: 0, count: 0 };
    total.cents += row.cents;
    total.count += 1;
    byCurrency.set(currency, total);
  }

  return [...byCurrency.values()].sort((a, b) => b.cents - a.cents);
}

/** The headline group, plus whether anything is being left out of it. */
export function primaryAmount(
  amounts: CurrencyAmount[],
  fallbackCurrency = DEFAULT_CURRENCY,
): CurrencyAmount & { mixed: boolean } {
  const primary = amounts[0] ?? { currency: fallbackCurrency, cents: 0, count: 0 };
  return { ...primary, mixed: amounts.length > 1 };
}

/* ---------------------------------------------------------------------------
   Types
--------------------------------------------------------------------------- */

export type PortalInvoiceItem = {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  /** What is still owed on this document — never the total on a part-paid one. */
  balanceCents: number;
  /** Sent, still owing, and past its due date. Decided here, never in the UI. */
  overdue: boolean;
  /** Days until due; negative once it is late. Null when there is no due date. */
  daysUntilDue: number | null;
};

export type PortalServiceItem = {
  id: string;
  label: string;
  status: ClientServiceStatus;
  unitAmountCents: number;
  quantity: number;
  termCount: number;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  startedAt: Date | null;
  nextBillAt: Date | null;
  cancelledAt: Date | null;
  lastPaymentAt: Date | null;
  /** Whether this line renews by itself at the provider, or is invoiced by hand. */
  autoRenews: boolean;
  /** The domains, mailboxes and sites actually set up under this line. */
  items: { id: string; label: string }[];
  /** Live and past its next bill date — computed server-side, never Date.now() in a component. */
  overdue: boolean;
  daysUntilRenewal: number | null;
};

export type PortalPaymentItem = {
  id: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  description: string | null;
  paidAt: Date | null;
  createdAt: Date;
  /** Never shown verbatim — a provider's decline text is not client-facing copy. */
  failed: boolean;
};

export type PortalOverview = {
  client: SessionClient;
  /** Outstanding across every issued, unpaid invoice. The number they owe today. */
  outstanding: CurrencyAmount[];
  /** The overdue slice of the above — a subset, not an addition to it. */
  overdue: CurrencyAmount[];
  /** The invoice to pay next: soonest due, then oldest. Null when nothing is owed. */
  nextInvoice: PortalInvoiceItem | null;
  /** Every unpaid invoice, soonest due first. Drives the "what's owed" list. */
  unpaidInvoices: PortalInvoiceItem[];
  invoices: PortalInvoiceItem[];
  services: PortalServiceItem[];
  serviceCounts: {
    active: number;
    awaitingPayment: number;
    paused: number;
    cancelled: number;
  };
  /** What the live lines cost per month/year — the same maths as staff MRR. */
  recurring: CurrencyTotal[];
  /** The next renewals, soonest first. Only lines that are still live. */
  upcoming: PortalServiceItem[];
  payments: PortalPaymentItem[];
  paidThisYear: CurrencyAmount[];
  paidAllTime: CurrencyAmount[];
  lastPaymentAt: Date | null;
};

/* ---------------------------------------------------------------------------
   Reads
--------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between now and `date`, positive for the future.
 *
 * Both ends are floored to a DATE first. An invoice due "tomorrow" should say
 * tomorrow at 9am and at 11pm alike — counting raw milliseconds would flip it
 * to "today" halfway through the afternoon.
 */
function daysUntil(date: Date, now: Date): number {
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY_MS);
}

function toInvoiceItem(
  row: {
    id: string;
    number: string;
    status: InvoiceStatus;
    issueDate: string | Date;
    dueDate: string | Date | null;
    currency: string;
    totalCents: number;
    amountPaidCents: number;
  },
  now: Date,
): PortalInvoiceItem {
  const issueDate = dateOnly(row.issueDate);
  const dueDate = row.dueDate ? dateOnly(row.dueDate) : null;
  const balanceCents = Math.max(row.totalCents - row.amountPaidCents, 0);

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    issueDate,
    dueDate,
    currency: row.currency,
    totalCents: row.totalCents,
    amountPaidCents: row.amountPaidCents,
    balanceCents,
    overdue:
      row.status === "sent" && balanceCents > 0 && dueDate !== null
        ? dueDate.getTime() < now.getTime()
        : false,
    daysUntilDue: dueDate ? daysUntil(dueDate, now) : null,
  };
}

/**
 * Every invoice the client is allowed to see, newest first.
 *
 * The balance and the overdue flag are decided here rather than in the page:
 * they are the two numbers a client acts on, and a component that computes them
 * from Date.now() renders one answer on the server and another after hydration.
 */
export async function listPortalInvoices(): Promise<PortalInvoiceItem[]> {
  const session = await requirePortalSession();
  const now = new Date();

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, session.clientId),
        inArray(invoices.status, VISIBLE_INVOICE_STATUSES),
      ),
    )
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  return rows.map((row) => toInvoiceItem(row, now));
}

/**
 * How many invoices are issued and still owing.
 *
 * Its own COUNT rather than listPortalInvoices().length, because the shell
 * renders this badge on every page: a layout should not pull the whole invoice
 * history down to put a "2" next to a nav item.
 */
export async function countPortalUnpaid(): Promise<number> {
  const session = await requirePortalSession();

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, session.clientId),
        eq(invoices.status, "sent"),
        sql`${invoices.totalCents} - ${invoices.amountPaidCents} > 0`,
      ),
    );

  return row?.count ?? 0;
}

/**
 * One invoice, by id, scoped to the signed-in client's own account.
 *
 * The id arrives from the URL, so the client_id predicate is what makes that
 * safe: another client's invoice id resolves to null here and 404s, exactly as
 * a made-up one does. The predicate is part of the WHERE rather than a check
 * on the result, so there is no window in which the wrong document exists in
 * memory at all.
 */
export type PortalInvoiceDetail = InvoiceDetail & {
  balanceCents: number;
  overdue: boolean;
  daysUntilDue: number | null;
};

export async function getPortalInvoice(
  invoiceId: string,
): Promise<PortalInvoiceDetail | null> {
  const session = await requirePortalSession();

  // Cheap shape check first — the id is user input, and a malformed uuid is a
  // Postgres error rather than an empty result.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
    return null;
  }

  const invoice = await loadInvoiceUnchecked(
    and(
      eq(invoices.id, invoiceId),
      eq(invoices.clientId, session.clientId),
      inArray(invoices.status, VISIBLE_INVOICE_STATUSES),
    ),
  );
  if (!invoice) return null;

  // Decided here, alongside every other deadline in this file, rather than in
  // the page. "Is this late" is a fact about the data, not about the render,
  // and a component that reaches for the clock is a component whose answer
  // depends on when it happened to run.
  const now = new Date();
  const balanceCents = Math.max(invoice.totalCents - invoice.amountPaidCents, 0);

  return {
    ...invoice,
    balanceCents,
    overdue:
      invoice.status === "sent" &&
      balanceCents > 0 &&
      invoice.dueDate !== null &&
      invoice.dueDate.getTime() < now.getTime(),
    daysUntilDue: invoice.dueDate ? daysUntil(invoice.dueDate, now) : null,
  };
}

/**
 * The client's services — what they are paying for and whether it is still on.
 *
 * `autoRenews` is the honest answer to "will this bill me again by itself":
 * true only when a subscription exists at the provider. A line KPVE invoices by
 * hand still has a next bill date, and saying "renews automatically" about it
 * would be a promise the system does not keep.
 */
export async function listPortalServices(): Promise<PortalServiceItem[]> {
  const session = await requirePortalSession();
  const now = new Date();

  const rows = await db
    .select({
      id: clientServices.id,
      label: clientServices.label,
      status: clientServices.status,
      unitAmountCents: clientServices.unitAmountCents,
      quantity: clientServices.quantity,
      termCount: clientServices.termCount,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      startedAt: clientServices.startedAt,
      nextBillAt: clientServices.nextBillAt,
      cancelledAt: clientServices.cancelledAt,
      lastPaymentAt: clientServices.lastPaymentAt,
      externalSubscriptionId: clientServices.externalSubscriptionId,
    })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, session.clientId),
        inArray(clientServices.status, VISIBLE_SERVICE_STATUSES),
      ),
    )
    // Live lines first, then soonest to renew — the same order as the CRM.
    .orderBy(
      sql`case when ${clientServices.status} in ('active','pending_payment') then 0 else 1 end`,
      sql`${clientServices.nextBillAt} asc nulls last`,
      desc(clientServices.createdAt),
    );

  const itemsByLine = await loadServiceItems(rows.map((row) => row.id));

  return rows.map(({ externalSubscriptionId, ...row }) => ({
    ...row,
    autoRenews: Boolean(externalSubscriptionId),
    items: itemsByLine.get(row.id) ?? [],
    overdue:
      row.status === "active" && row.nextBillAt
        ? row.nextBillAt.getTime() < now.getTime()
        : false,
    daysUntilRenewal: row.nextBillAt ? daysUntil(row.nextBillAt, now) : null,
  }));
}

/**
 * Provisioned items for every line in ONE query, grouped in JS. A query per
 * line would be an N+1 on the portal's busiest page — the same reason
 * listClientServices does it this way for staff.
 */
async function loadServiceItems(
  clientServiceIds: string[],
): Promise<Map<string, { id: string; label: string }[]>> {
  const byLine = new Map<string, { id: string; label: string }[]>();
  // inArray with an empty list is an invalid query, and a client with nothing
  // provisioned yet is a normal state.
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

/**
 * The payment history.
 *
 * `failureReason` is deliberately not returned. It is a provider's own string
 * ("card_declined: insufficient_funds") written for staff triage, and putting
 * it in front of the cardholder is both unhelpful and occasionally wrong. The
 * portal says a payment failed and offers the button again.
 */
export async function listPortalPayments(limit = 50): Promise<PortalPaymentItem[]> {
  const session = await requirePortalSession();

  const rows = await db
    .select({
      id: payments.id,
      status: payments.status,
      amountCents: payments.amountCents,
      currency: payments.currency,
      description: payments.description,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.clientId, session.clientId))
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(limit, 200));

  return rows.map((row) => ({ ...row, failed: row.status === "failed" }));
}

/**
 * Everything the overview needs, in one pass.
 *
 * The four reads run concurrently — they touch different tables and none of
 * them depends on another's result. Each re-verifies the session through
 * requirePortalSession(), which is cache()d per request, so the extra calls
 * cost nothing and the guarantee stays on every individual function rather
 * than on the order they happen to be called in.
 */
export async function getPortalOverview(): Promise<PortalOverview> {
  const session = await requirePortalSession();
  const now = new Date();

  const [invoiceList, services, paymentList, collected] = await Promise.all([
    listPortalInvoices(),
    listPortalServices(),
    listPortalPayments(),
    collectedTotals(session, now),
  ]);

  const unpaid = invoiceList
    .filter((invoice) => invoice.status === "sent" && invoice.balanceCents > 0)
    // Soonest due first; anything with no due date sinks to the bottom.
    .sort((a, b) => {
      const aDue = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.issueDate.getTime() - b.issueDate.getTime();
    });

  const outstanding = groupByCurrency(
    unpaid.map((invoice) => ({
      currency: invoice.currency,
      cents: invoice.balanceCents,
    })),
  );

  const overdue = groupByCurrency(
    unpaid
      .filter((invoice) => invoice.overdue)
      .map((invoice) => ({ currency: invoice.currency, cents: invoice.balanceCents })),
  );

  // Only live lines count toward "what this costs per month" — a cancelled
  // service is not a commitment, and an unpaid one is not revenue yet. Same
  // filter summarizeClientServices() applies for staff.
  const recurring = summarize(services.filter((line) => line.status === "active"));

  const upcoming = services
    .filter(
      (line) =>
        line.nextBillAt !== null &&
        (line.status === "active" || line.status === "pending_payment"),
    )
    .sort((a, b) => (a.nextBillAt as Date).getTime() - (b.nextBillAt as Date).getTime());

  const succeeded = paymentList.filter((payment) => payment.status === "succeeded");

  return {
    client: session,
    outstanding,
    overdue,
    nextInvoice: unpaid[0] ?? null,
    unpaidInvoices: unpaid,
    invoices: invoiceList,
    services,
    serviceCounts: {
      active: services.filter((line) => line.status === "active").length,
      awaitingPayment: services.filter((line) => line.status === "pending_payment")
        .length,
      paused: services.filter((line) => line.status === "paused").length,
      cancelled: services.filter((line) => line.status === "cancelled").length,
    },
    recurring,
    upcoming,
    payments: paymentList,
    paidThisYear: collected.thisYear,
    paidAllTime: collected.allTime,
    lastPaymentAt: succeeded[0]?.paidAt ?? null,
  };
}

/**
 * What this client has actually paid — settled money only.
 *
 * Summed in SQL rather than from listPortalPayments(), which is capped at 50
 * rows: a client three years in would otherwise see a lifetime total that
 * quietly stops counting once their history outgrows one page.
 */
async function collectedTotals(
  session: SessionClient,
  now: Date,
): Promise<{ thisYear: CurrencyAmount[]; allTime: CurrencyAmount[] }> {
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [thisYearRows, allTimeRows] = await Promise.all([
    db
      .select({
        currency: payments.currency,
        cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.clientId, session.clientId),
          eq(payments.status, "succeeded"),
          isNotNull(payments.paidAt),
          gte(payments.paidAt, yearStart),
        ),
      )
      .groupBy(payments.currency),
    db
      .select({
        currency: payments.currency,
        cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.clientId, session.clientId),
          eq(payments.status, "succeeded"),
          isNotNull(payments.paidAt),
        ),
      )
      .groupBy(payments.currency),
  ]);

  const sortDesc = (rows: CurrencyAmount[]) =>
    [...rows].sort((a, b) => b.cents - a.cents);

  return {
    thisYear: sortDesc(thisYearRows),
    allTime: sortDesc(allTimeRows),
  };
}
