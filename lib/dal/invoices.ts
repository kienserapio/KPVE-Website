import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServiceItems,
  clientServices,
  invoiceLines,
  invoices,
  payments,
  type BillingInterval,
  type InvoiceStatus,
} from "@/lib/db/schema";
import {
  addInterval,
  computeTax,
  DEFAULT_CURRENCY,
  type TaxBreakdown,
} from "@/lib/billing";
import { requireSession } from "./session";
import { getOrgSettings, getTaxSettings } from "./settings";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   Invoices — the document a client's accountant can actually file.

   The CRM already takes money (payment links) and records it (the ledger). It
   could not, until now, produce the thing a business needs to claim the expense:
   a tax invoice with both parties' legal names and ABNs on it. That is the whole
   point of this file.

   Two rules run through everything here:

     1. An issued invoice is a RECORD OF A MOMENT. Both parties, every line, the
        tax rate and the provisioned items are SNAPSHOTTED at issue — never a
        live lookup. Change KPVE's address next year and last year's invoices
        must still say what they said. An invoice that changes after issue is a
        compliance problem, not a convenience.

     2. There is still only ONE path that records revenue — applyPaymentSucceeded
        in lib/dal/payments.ts. Paying an invoice does not open a second one; it
        reconciles against that same ledger (see reconcilePaidService below).
--------------------------------------------------------------------------- */

/** A blank Postgres unique-violation is 23505 — the retry signal for numbering. */
const PG_UNIQUE_VIOLATION = "23505";

/* ---------------------------------------------------------------------------
   Types
--------------------------------------------------------------------------- */

export type InvoiceLineItem = {
  id: string;
  clientServiceId: string | null;
  label: string;
  description: string | null;
  unitAmountCents: number;
  quantity: number;
  amountCents: number;
  /** Provisioned items, newline-separated as snapshotted at issue. */
  details: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  position: number;
};

export type InvoiceListItem = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  /** Sent and past its due date — the closest thing to a collections queue. */
  overdue: boolean;
};

export type InvoiceDetail = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  taxRateBps: number;
  taxMode: TaxBreakdown["mode"];
  sellerName: string;
  sellerAbn: string | null;
  sellerAddress: string | null;
  sellerEmail: string | null;
  billToName: string;
  billToAbn: string | null;
  billToEmail: string | null;
  billToAddress: string | null;
  publicToken: string;
  notes: string | null;
  poNumber: string | null;
  sentAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  lines: InvoiceLineItem[];
  /**
   * The client's "Pay now" target. Only set when the invoice is a single
   * billing line that already has a live payment link — the common case of an
   * invoice raised for one recurring service. Multi-line invoices are paid by
   * EFT (the bank block) or by minting links per line on the client page.
   */
  payUrl: string | null;
  /** EFT block etc. — the live org details, for the "how to pay" footer only. */
  bankDetails: {
    bankName: string | null;
    bsb: string | null;
    accountName: string | null;
    accountNumber: string | null;
    invoiceFooter: string | null;
  };
};

/* ---------------------------------------------------------------------------
   Numbering — INV-<year>-<0001>, prefix from settings, counter per year.

   The UNIQUE index on invoices.number is the guarantee. Allocation is max+1
   with a bounded retry, the same shape as uniqueSlug() in lib/dal/services.ts:
   two people pressing "Create invoice" at once get two numbers, not one number
   and a 500.
--------------------------------------------------------------------------- */

function invoiceNumber(prefix: string, year: number, counter: number): string {
  return `${prefix}-${year}-${String(counter).padStart(4, "0")}`;
}

/** Highest counter already used for this prefix+year, or 0 if none. */
async function highestCounter(prefix: string, year: number): Promise<number> {
  const like = `${prefix}-${year}-%`;
  const [row] = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(sql`${invoices.number} like ${like}`)
    // Order by the numeric suffix, not the string, so -0009 < -0010.
    .orderBy(sql`substring(${invoices.number} from '(\\d+)$')::int desc`)
    .limit(1);

  if (!row) return 0;
  const suffix = row.number.match(/(\d+)$/);
  return suffix ? Number(suffix[1]) : 0;
}

/* ---------------------------------------------------------------------------
   Period for a line — "1 Aug – 31 Aug".

   A recurring line's invoice covers one cycle from the issue date. A one-off
   covers nothing (there is no period to a single fee), so both dates stay null.
--------------------------------------------------------------------------- */

function linePeriod(
  issueDate: Date,
  interval: BillingInterval,
): { start: string | null; end: string | null } {
  const next = addInterval(issueDate, interval);
  if (!next) return { start: null, end: null };
  // End the day before the next cycle begins, so periods tile without overlap.
  const end = new Date(next);
  end.setDate(end.getDate() - 1);
  return { start: toDateString(issueDate), end: toDateString(end) };
}

/** Date → 'YYYY-MM-DD' in local time, for a `date` column. */
function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* ---------------------------------------------------------------------------
   Create — snapshot the client's selected lines into an issued document.
--------------------------------------------------------------------------- */

export async function createInvoiceFromServices(input: {
  clientId: string;
  clientServiceIds: string[];
  issueDate?: Date;
  dueDate?: Date;
  poNumber?: string;
  notes?: string;
}): Promise<{ id: string; number: string }> {
  const staff = await requireSession();

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      clientType: clients.clientType,
      contactName: clients.contactName,
      email: clients.email,
      billingName: clients.billingName,
      billingAbn: clients.billingAbn,
      billingEmail: clients.billingEmail,
      billingAddress: clients.billingAddress,
    })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  // Only this client's lines, and only the ones asked for. Filtering by client
  // as well as id stops one client's invoice from ever pulling another's line.
  const lines = await db
    .select({
      id: clientServices.id,
      label: clientServices.label,
      notes: clientServices.notes,
      unitAmountCents: clientServices.unitAmountCents,
      quantity: clientServices.quantity,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
    })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, input.clientId),
        inArray(clientServices.id, input.clientServiceIds),
      ),
    );
  if (lines.length === 0) throw new Error("NO_LINES");

  // One invoice is one currency. Mixing them would make a subtotal that lies —
  // the same reason lib/billing never sums across currencies.
  const currency = (lines[0].currency || DEFAULT_CURRENCY).toUpperCase();
  if (lines.some((l) => (l.currency || DEFAULT_CURRENCY).toUpperCase() !== currency)) {
    throw new Error("MIXED_CURRENCY");
  }

  // Provisioned items for every selected line, in one query, grouped in JS.
  const itemRows = await db
    .select({
      clientServiceId: clientServiceItems.clientServiceId,
      label: clientServiceItems.label,
    })
    .from(clientServiceItems)
    .where(inArray(clientServiceItems.clientServiceId, input.clientServiceIds))
    .orderBy(asc(clientServiceItems.position), asc(clientServiceItems.createdAt));

  const itemsByLine = new Map<string, string[]>();
  for (const row of itemRows) {
    const list = itemsByLine.get(row.clientServiceId) ?? [];
    list.push(row.label);
    itemsByLine.set(row.clientServiceId, list);
  }

  const settings = await getOrgSettings();
  const taxSettings = await getTaxSettings();
  const breakdown = computeTax(
    lines.map((l) => l.amountCents),
    taxSettings,
  );

  const issueDate = input.issueDate ?? new Date();
  const dueDate =
    input.dueDate ??
    (() => {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + settings.paymentTermsDays);
      return d;
    })();

  // Bill-to falls back to the contact details when the billing profile is blank,
  // so a company with no separate accounts contact still gets a usable invoice.
  const billToName = client.billingName || client.name;
  const billToEmail = client.billingEmail || client.email;

  const year = issueDate.getFullYear();
  const prefix = settings.invoicePrefix || "INV";

  // Retry the whole insert on a number collision — a concurrent create took the
  // counter we picked. Bounded so a genuine bug can't spin forever.
  for (let attempt = 0; attempt < 10; attempt++) {
    const counter = (await highestCounter(prefix, year)) + 1;
    const number = invoiceNumber(prefix, year, counter);
    const publicToken = randomBytes(16).toString("hex");

    try {
      const invoiceId = await db.transaction(async (tx) => {
        const [invoice] = await tx
          .insert(invoices)
          .values({
            clientId: client.id,
            number,
            status: "draft",
            issueDate: toDateString(issueDate),
            dueDate: toDateString(dueDate),
            currency,
            subtotalCents: breakdown.subtotalCents,
            taxCents: breakdown.taxCents,
            totalCents: breakdown.totalCents,
            taxRateBps: breakdown.taxRateBps,
            taxMode: breakdown.mode,
            sellerName: settings.legalName,
            sellerAbn: settings.abn,
            sellerAddress: settings.address,
            sellerEmail: settings.email,
            billToName,
            billToAbn: client.billingAbn,
            billToEmail,
            billToAddress: client.billingAddress,
            publicToken,
            poNumber: input.poNumber ?? null,
            notes: input.notes ?? null,
            createdBy: staff.id,
          })
          .returning({ id: invoices.id });

        await tx.insert(invoiceLines).values(
          lines.map((line, index) => {
            const period = linePeriod(issueDate, line.interval);
            const items = itemsByLine.get(line.id) ?? [];
            return {
              invoiceId: invoice.id,
              clientServiceId: line.id,
              label: line.label,
              description: line.notes,
              unitAmountCents: line.unitAmountCents,
              quantity: line.quantity,
              amountCents: line.amountCents,
              details: items.length ? items.join("\n") : null,
              periodStart: period.start,
              periodEnd: period.end,
              position: index,
            };
          }),
        );

        return invoice.id;
      });

      await logActivity({
        actorType: "staff",
        actorId: staff.id,
        entityType: "invoice",
        entityId: invoiceId,
        action: "invoice.created",
        metadata: { number, clientId: client.id, totalCents: breakdown.totalCents, currency },
      });

      return { id: invoiceId, number };
    } catch (error) {
      if (isUniqueViolation(error)) continue; // number raced — pick the next one
      throw error;
    }
  }

  throw new Error("NUMBER_ALLOCATION_FAILED");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/* ---------------------------------------------------------------------------
   Reads
--------------------------------------------------------------------------- */

export async function listInvoices(filters: {
  status?: InvoiceStatus;
  clientId?: string;
}): Promise<InvoiceListItem[]> {
  await requireSession();

  const conditions = [];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  if (filters.clientId) conditions.push(eq(invoices.clientId, filters.clientId));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      clientName: clients.name,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(where)
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    issueDate: dateOnly(row.issueDate),
    dueDate: row.dueDate ? dateOnly(row.dueDate) : null,
    overdue:
      row.status === "sent" && row.dueDate
        ? dateOnly(row.dueDate).getTime() < now
        : false,
  }));
}

export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  await requireSession();
  return loadInvoice(eq(invoices.id, id));
}

/**
 * The client's own copy, addressed by the unguessable token. Deliberately NOT
 * session-gated — the client has no admin login, and the token IS the credential,
 * exactly as /pay/[ref] works. A draft is never shown here: it is not yet a
 * document, so a token for one behaves as if it doesn't exist.
 */
export async function getInvoiceByToken(token: string): Promise<InvoiceDetail | null> {
  // Cheap shape check before touching the DB — the token is user input.
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const invoice = await loadInvoice(eq(invoices.publicToken, token));
  if (!invoice || invoice.status === "draft") return null;
  return invoice;
}

async function loadInvoice(
  where: ReturnType<typeof eq>,
): Promise<InvoiceDetail | null> {
  const [row] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      clientName: clients.name,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      subtotalCents: invoices.subtotalCents,
      taxCents: invoices.taxCents,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      taxRateBps: invoices.taxRateBps,
      taxMode: invoices.taxMode,
      sellerName: invoices.sellerName,
      sellerAbn: invoices.sellerAbn,
      sellerAddress: invoices.sellerAddress,
      sellerEmail: invoices.sellerEmail,
      billToName: invoices.billToName,
      billToAbn: invoices.billToAbn,
      billToEmail: invoices.billToEmail,
      billToAddress: invoices.billToAddress,
      publicToken: invoices.publicToken,
      notes: invoices.notes,
      poNumber: invoices.poNumber,
      sentAt: invoices.sentAt,
      paidAt: invoices.paidAt,
      voidedAt: invoices.voidedAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(where)
    .limit(1);

  if (!row) return null;

  const lineRows = await db
    .select({
      id: invoiceLines.id,
      clientServiceId: invoiceLines.clientServiceId,
      label: invoiceLines.label,
      description: invoiceLines.description,
      unitAmountCents: invoiceLines.unitAmountCents,
      quantity: invoiceLines.quantity,
      amountCents: invoiceLines.amountCents,
      details: invoiceLines.details,
      periodStart: invoiceLines.periodStart,
      periodEnd: invoiceLines.periodEnd,
      position: invoiceLines.position,
    })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, row.id))
    .orderBy(asc(invoiceLines.position));

  // The EFT block is a live lookup on purpose: it is "how to pay us now", not a
  // record of the transaction, so a changed bank account should reach an
  // already-sent, still-unpaid invoice.
  const settings = await getOrgSettings();

  // Pay-now link: only when the whole invoice is one line that still has a live
  // checkout URL, and only while it's unpaid. Paid/void invoices show no button.
  let payUrl: string | null = null;
  const soleServiceId =
    lineRows.length === 1 ? lineRows[0].clientServiceId : null;
  if (soleServiceId && (row.status === "sent" || row.status === "draft")) {
    const [line] = await db
      .select({ checkoutUrl: clientServices.checkoutUrl })
      .from(clientServices)
      .where(eq(clientServices.id, soleServiceId))
      .limit(1);
    payUrl = line?.checkoutUrl ?? null;
  }

  return {
    ...row,
    issueDate: dateOnly(row.issueDate),
    dueDate: row.dueDate ? dateOnly(row.dueDate) : null,
    payUrl,
    lines: lineRows.map((l) => ({
      ...l,
      periodStart: l.periodStart ? dateOnly(l.periodStart) : null,
      periodEnd: l.periodEnd ? dateOnly(l.periodEnd) : null,
    })),
    bankDetails: {
      bankName: settings.bankName,
      bsb: settings.bsb,
      accountName: settings.accountName,
      accountNumber: settings.accountNumber,
      invoiceFooter: settings.invoiceFooter,
    },
  };
}

/** A `date` column comes back as 'YYYY-MM-DD'; read it as local midnight. */
function dateOnly(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(`${value}T00:00:00`);
}

export async function listClientInvoices(clientId: string): Promise<InvoiceListItem[]> {
  await requireSession();
  return listInvoices({ clientId });
}

/** Distinct client_service ids already invoiced — drives the "new invoice" picker. */
export async function invoicedServiceIds(clientId: string): Promise<Set<string>> {
  await requireSession();
  const rows = await db
    .select({ clientServiceId: invoiceLines.clientServiceId })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .where(and(eq(invoices.clientId, clientId), ne(invoices.status, "void")));
  const set = new Set<string>();
  for (const row of rows) if (row.clientServiceId) set.add(row.clientServiceId);
  return set;
}

/* ---------------------------------------------------------------------------
   Status transitions

   draft  → sent | void
   sent   → paid | void
   paid   → void        (a paid-in-error invoice can still be voided)
   void   → (terminal)

   Draft is the only editable, deletable state. Once it is a document a client
   has, it is void-and-reissue — which is how invoices work everywhere.
--------------------------------------------------------------------------- */

const ALLOWED: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["paid", "void"],
  paid: ["void"],
  void: [],
};

export async function setInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [current] = await db
    .select({ status: invoices.status, clientId: invoices.clientId, totalCents: invoices.totalCents })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");

  if (current.status === status) return { clientId: current.clientId };
  if (!ALLOWED[current.status].includes(status)) throw new Error("BAD_TRANSITION");

  const now = new Date();
  const set: Record<string, unknown> = { status, updatedAt: now };
  if (status === "sent") set.sentAt = now;
  if (status === "paid") {
    set.paidAt = now;
    set.amountPaidCents = current.totalCents;
  }
  if (status === "void") set.voidedAt = now;

  await db.update(invoices).set(set).where(eq(invoices.id, id));

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "invoice",
    entityId: id,
    action: `invoice.${status}`,
    metadata: { from: current.status },
  });

  return { clientId: current.clientId };
}

export async function updateInvoice(
  id: string,
  patch: { issueDate?: Date; dueDate?: Date; poNumber?: string; notes?: string },
): Promise<{ clientId: string }> {
  await requireSession();

  const [current] = await db
    .select({ status: invoices.status, clientId: invoices.clientId })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");
  // Editing an issued invoice would change a document a client already holds.
  if (current.status !== "draft") throw new Error("NOT_DRAFT");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.issueDate !== undefined) set.issueDate = toDateString(patch.issueDate);
  if (patch.dueDate !== undefined) set.dueDate = toDateString(patch.dueDate);
  if (patch.poNumber !== undefined) set.poNumber = patch.poNumber || null;
  if (patch.notes !== undefined) set.notes = patch.notes || null;

  await db.update(invoices).set(set).where(eq(invoices.id, id));
  return { clientId: current.clientId };
}

export async function deleteInvoice(id: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [current] = await db
    .select({ status: invoices.status, clientId: invoices.clientId, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");
  // A sent invoice is a record. It is voided, never deleted — deleting it would
  // punch a hole in the number sequence, which is the first thing an auditor asks about.
  if (current.status !== "draft") throw new Error("NOT_DRAFT");

  await db.delete(invoices).where(eq(invoices.id, id));

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "invoice",
    entityId: id,
    action: "invoice.deleted",
    metadata: { number: current.number, wasDraft: true },
  });

  return { clientId: current.clientId };
}

/* ---------------------------------------------------------------------------
   Reconciliation — called from applyPaymentSucceeded (lib/dal/payments.ts).

   Kept HERE, and importing nothing from payments.ts, so there is no import
   cycle: payments → invoices, never back. Best-effort by contract: the caller
   wraps it in try/catch, because an invoice edge case must never fail a real
   payment. The ledger is still the source of truth; this only joins the money
   already recorded to the document it settles.

   An invoice is marked paid only when it is ENTIRELY for the line just paid
   (every line points at the same client_service) and the payment covers its
   total. That is the common case — an invoice raised for one recurring line —
   and it deliberately refuses to close a multi-line invoice off a single line's
   payment, which would report money we haven't been paid.
--------------------------------------------------------------------------- */

export async function reconcilePaidService(input: {
  clientServiceId: string;
  paymentId: string;
  amountCents: number;
  paidAt: Date;
}): Promise<void> {
  // Candidate invoices: unpaid, not void, that reference this line.
  const candidates = await db
    .select({
      id: invoices.id,
      totalCents: invoices.totalCents,
      number: invoices.number,
      clientId: invoices.clientId,
    })
    .from(invoices)
    .innerJoin(invoiceLines, eq(invoiceLines.invoiceId, invoices.id))
    .where(
      and(
        eq(invoiceLines.clientServiceId, input.clientServiceId),
        inArray(invoices.status, ["draft", "sent"]),
      ),
    )
    .orderBy(desc(invoices.issueDate));

  for (const candidate of candidates) {
    if (input.amountCents < candidate.totalCents) continue;

    // Only close it if the WHOLE invoice is this one line.
    const otherLines = await db
      .select({ id: invoiceLines.id })
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.invoiceId, candidate.id),
          ne(invoiceLines.clientServiceId, input.clientServiceId),
        ),
      )
      .limit(1);
    if (otherLines.length > 0) continue;

    await db
      .update(invoices)
      .set({
        status: "paid",
        paidAt: input.paidAt,
        amountPaidCents: candidate.totalCents,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, candidate.id));

    // Join the ledger row to the document it settled.
    await db
      .update(payments)
      .set({ invoiceId: candidate.id })
      .where(eq(payments.id, input.paymentId));

    await logActivity({
      actorType: "system",
      entityType: "invoice",
      entityId: candidate.id,
      action: "invoice.paid",
      metadata: { number: candidate.number, via: "payment", paymentId: input.paymentId },
    });

    return; // one payment settles at most one invoice
  }
}

/* ---------------------------------------------------------------------------
   Header counts for /admin/invoices
--------------------------------------------------------------------------- */

export type InvoiceStats = {
  total: number;
  draft: number;
  sent: number;
  overdue: number;
  paidThisMonthCents: number;
  outstandingCents: number;
  currency: string;
};

export async function getInvoiceStats(): Promise<InvoiceStats> {
  await requireSession();

  const rows = await db
    .select({
      status: invoices.status,
      dueDate: invoices.dueDate,
      totalCents: invoices.totalCents,
      currency: invoices.currency,
      paidAt: invoices.paidAt,
    })
    .from(invoices);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let draft = 0;
  let sent = 0;
  let overdue = 0;
  let paidThisMonthCents = 0;
  let outstandingCents = 0;
  // Whichever currency carries the most invoices — the headline, same rule the
  // client list uses for its dominant-currency column.
  const currencyCount = new Map<string, number>();

  for (const row of rows) {
    currencyCount.set(row.currency, (currencyCount.get(row.currency) ?? 0) + 1);
    if (row.status === "draft") draft++;
    if (row.status === "sent") {
      sent++;
      outstandingCents += row.totalCents;
      if (row.dueDate && dateOnly(row.dueDate).getTime() < now.getTime()) overdue++;
    }
    if (row.status === "paid" && row.paidAt && row.paidAt.getTime() >= monthStart.getTime()) {
      paidThisMonthCents += row.totalCents;
    }
  }

  const currency =
    [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_CURRENCY;

  return {
    total: rows.length,
    draft,
    sent,
    overdue,
    paidThisMonthCents,
    outstandingCents,
    currency,
  };
}
