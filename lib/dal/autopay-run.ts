import "server-only";

import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  autopayAttempts,
  clientAutopay,
  clients,
  invoices,
  payments,
} from "@/lib/db/schema";
import type { AutopayInvoiceRow } from "@/lib/autopay/select";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   The reads and writes AutoPay needs when NOBODY IS SIGNED IN.

   Its own file, with this warning on it, for the same reason lib/dal/portal-
   users.ts exists: nothing here calls requireSession() or requirePortalSession()
   because nothing here can. The callers are the nightly job (authorized by a
   bearer token it compares itself) and the Stripe webhook (authorized by an
   HMAC). Neither has a cookie, and pretending otherwise by threading a fake
   session through would only hide which functions are exposed.

   The session-scoped half — what the portal and the CRM call — is in
   lib/dal/autopay.ts.
--------------------------------------------------------------------------- */

export type AutopayCandidate = AutopayInvoiceRow & {
  /** `cus_…`, needed to charge. Null means the client has never paid us. */
  customerId: string | null;
  clientName: string;
  email: string | null;
  /** For the receipt and the failure email — "Visa ending 4242". */
  cardBrand: string | null;
  cardLast4: string | null;
};

/**
 * Everything the run needs to decide, in one query.
 *
 * Narrowed here to invoices that are issued, due, and belong to a client who
 * has an AutoPay row at all. The remaining rules live in planAutopayRun() and
 * are deliberately re-checked there against these same rows — this WHERE is an
 * index hint, not the authority on what may be charged. A run that reported
 * "skipped: autopay_off" for every invoice of every client would drown the one
 * line that matters.
 */
export async function loadAutopayCandidates(asOf: Date): Promise<AutopayCandidate[]> {
  const asOfDate = toDateString(asOf);

  const rows = await db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      status: invoices.status,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      noticeSentAt: invoices.autopayNoticeSentAt,
      checkoutCreatedAt: invoices.checkoutCreatedAt,
      autopayEnabled: clientAutopay.enabled,
      paymentMethodId: clientAutopay.paymentMethodId,
      consecutiveFailures: clientAutopay.consecutiveFailures,
      customerId: clients.billingCustomerId,
      clientName: clients.name,
      email: sql<string | null>`coalesce(${invoices.billToEmail}, ${clients.email})`,
      cardBrand: clientAutopay.cardBrand,
      cardLast4: clientAutopay.cardLast4,
      // Counted in SQL rather than fetched and counted here: an invoice with a
      // long history of attempts must still cost one row.
      attemptCount: sql<number>`(
        select count(*)::int from ${autopayAttempts}
        where ${autopayAttempts.invoiceId} = ${invoices.id}
      )`,
      openAttempt: sql<boolean>`exists (
        select 1 from ${autopayAttempts}
        where ${autopayAttempts.invoiceId} = ${invoices.id}
          and ${autopayAttempts.status} = 'started'
      )`,
    })
    .from(invoices)
    .innerJoin(clientAutopay, eq(clientAutopay.clientId, invoices.clientId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.status, "sent"),
        isNotNull(invoices.dueDate),
        lte(invoices.dueDate, asOfDate),
      ),
    )
    .orderBy(asc(invoices.dueDate));

  return rows.map((row) => ({
    ...row,
    // `date` columns come back as 'YYYY-MM-DD'. Parsed as UTC midnight because
    // that is what planAutopayRun compares against — see startOfUtcDay there.
    dueDate: row.dueDate ? new Date(`${row.dueDate}T00:00:00.000Z`) : null,
  }));
}

/**
 * Invoices whose "we'll charge your card on the 30th" is due to go out.
 *
 * Deliberately includes invoices already past due: an invoice issued with a due
 * date in the past still gets its notice, and becomes chargeable on the next
 * run rather than this one. Being late is not a reason to skip the warning.
 */
export async function listAutopayNoticeDue(
  asOf: Date,
  noticeDays: number,
): Promise<
  {
    invoiceId: string;
    number: string;
    clientId: string;
    clientName: string;
    email: string | null;
    dueDate: string | null;
    currency: string;
    balanceCents: number;
    cardBrand: string | null;
    cardLast4: string | null;
  }[]
> {
  const horizon = new Date(asOf);
  horizon.setUTCDate(horizon.getUTCDate() + Math.max(0, noticeDays));

  return db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      clientName: clients.name,
      email: sql<string | null>`coalesce(${invoices.billToEmail}, ${clients.email})`,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      balanceCents: sql<number>`(${invoices.totalCents} - ${invoices.amountPaidCents})`,
      cardBrand: clientAutopay.cardBrand,
      cardLast4: clientAutopay.cardLast4,
    })
    .from(invoices)
    .innerJoin(clientAutopay, eq(clientAutopay.clientId, invoices.clientId))
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.status, "sent"),
        isNull(invoices.autopayNoticeSentAt),
        isNotNull(invoices.dueDate),
        lte(invoices.dueDate, toDateString(horizon)),
        eq(clientAutopay.enabled, true),
        isNotNull(clientAutopay.paymentMethodId),
        sql`${invoices.totalCents} - ${invoices.amountPaidCents} > 0`,
      ),
    )
    .orderBy(asc(invoices.dueDate));
}

/**
 * Stamped only after the mail actually left. A notice that failed to send must
 * not unlock the charge — that is the whole point of the gate.
 */
export async function markAutopayNoticeSent(invoiceId: string): Promise<void> {
  await db
    .update(invoices)
    .set({ autopayNoticeSentAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(invoices.id, invoiceId), isNull(invoices.autopayNoticeSentAt)));
}

/**
 * Claim the right to charge one invoice, BEFORE any money moves.
 *
 * Returns null when the claim is refused, which happens for exactly one reason:
 * something else already holds it. `unique (invoice_id, attempt_no)` makes two
 * overlapping runs resolve to one charge rather than two, and the same index
 * makes a re-run of a completed attempt a no-op instead of a repeat.
 *
 * The caller must treat null as "leave this invoice alone", never as an error
 * to retry.
 */
export async function beginAutopayAttempt(input: {
  invoiceId: string;
  clientId: string;
  attemptNo: number;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
}): Promise<{ attemptId: string } | null> {
  const [row] = await db
    .insert(autopayAttempts)
    .values({
      invoiceId: input.invoiceId,
      clientId: input.clientId,
      attemptNo: input.attemptNo,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "started",
    })
    .onConflictDoNothing()
    .returning({ id: autopayAttempts.id });

  return row ? { attemptId: row.id } : null;
}

/**
 * The charge went through.
 *
 * Note what this does NOT do: it does not touch the invoice or write the
 * ledger. That is applyPaymentSucceeded()'s job, and it stays there so an
 * AutoPay payment and a client pressing "Pay now" settle through one code path
 * with one set of rules. This only closes the attempt and resets the client's
 * failure streak.
 */
export async function resolveAutopayAttemptSucceeded(input: {
  attemptId: string;
  clientId: string;
  paymentIntentId: string | null;
}): Promise<void> {
  await db
    .update(autopayAttempts)
    .set({
      status: "succeeded",
      paymentIntentId: input.paymentIntentId,
      resolvedAt: sql`now()`,
    })
    .where(eq(autopayAttempts.id, input.attemptId));

  await db
    .update(clientAutopay)
    .set({
      lastChargeAt: sql`now()`,
      consecutiveFailures: 0,
      lastFailureCode: null,
      updatedAt: sql`now()`,
    })
    .where(eq(clientAutopay.clientId, input.clientId));
}

/**
 * The card said no.
 *
 * Three writes, and the order matters: close the attempt (so the invoice is not
 * left blocked by a `started` row), record the failure against the client, then
 * write a `failed` payment row so the money story is visible in the CRM and in
 * the client's own payment history rather than only in a log.
 *
 * `applyPaymentFailed()` is deliberately not reused: it requires a
 * client_service_id and has no invoice branch, so it cannot describe this.
 */
export async function resolveAutopayAttemptFailed(input: {
  attemptId: string;
  clientId: string;
  invoiceId: string;
  paymentIntentId: string | null;
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  code: string;
  message: string;
  provider: string;
}): Promise<void> {
  // Scoped to the attempt still being open, and the rest of this function runs
  // only if that transition was ours to make. The run hears about a decline
  // synchronously AND the webhook reports it — without this, one declined card
  // counts twice against the client and suspends them a decline early.
  const [closed] = await db
    .update(autopayAttempts)
    .set({
      status: "failed",
      paymentIntentId: input.paymentIntentId,
      errorCode: input.code,
      errorMessage: input.message,
      resolvedAt: sql`now()`,
    })
    .where(and(eq(autopayAttempts.id, input.attemptId), eq(autopayAttempts.status, "started")))
    .returning({ id: autopayAttempts.id });

  if (!closed) return;

  await db
    .update(clientAutopay)
    .set({
      lastFailureAt: sql`now()`,
      lastFailureCode: input.code,
      consecutiveFailures: sql`${clientAutopay.consecutiveFailures} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(clientAutopay.clientId, input.clientId));

  // Suffixed, and that suffix is load-bearing. One PaymentIntent can fail and
  // then succeed — `authentication_required` leaves it waiting for the client,
  // who can still complete it from Stripe's own page. If the failure row held
  // the bare `pi_…`, the success arriving later would collide with it, be
  // dropped as a duplicate, and the invoice would never be credited for money
  // that had genuinely been taken.
  await db
    .insert(payments)
    .values({
      clientId: input.clientId,
      invoiceId: input.invoiceId,
      provider: input.provider,
      providerRef: `${input.paymentIntentId ?? input.idempotencyKey}_failed`,
      status: "failed",
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      description: "AutoPay",
      failureReason: input.message,
    })
    .onConflictDoNothing({ target: payments.providerRef });

  await logActivity({
    actorType: "system",
    entityType: "invoice",
    entityId: input.invoiceId,
    action: "autopay.charge_failed",
    metadata: { code: input.code, amountCents: input.amountCents },
  });
}

/**
 * Turn AutoPay off because the card has failed too many times running.
 *
 * A separate function rather than a branch inside the failure path: this is a
 * decision about the arrangement, not about one charge, and it is the thing
 * that has to be visible in the log when a client asks why their AutoPay
 * stopped.
 */
export async function suspendAutopayAfterFailures(input: {
  clientId: string;
  code: string;
}): Promise<void> {
  await db
    .update(clientAutopay)
    .set({ enabled: false, disabledAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(clientAutopay.clientId, input.clientId));

  await logActivity({
    actorType: "system",
    entityType: "client",
    entityId: input.clientId,
    action: "autopay.suspended",
    metadata: { reason: "consecutive_failures", code: input.code },
  });
}

/* ---------------------------------------------------------------------------
   Webhook-side writes
--------------------------------------------------------------------------- */

/**
 * A setup session finished and Stripe has told us which card it saved.
 *
 * Matched on `setup_ref`, which is unique, so a webhook redelivered three times
 * writes the same card three times rather than enabling AutoPay on the wrong
 * client. Enabling happens HERE and not when the client pressed the button: an
 * arrangement with no card behind it is not an arrangement.
 */
export async function completeAutopaySetup(input: {
  setupRef: string;
  provider: string;
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  customerId?: string | null;
}): Promise<{ clientId: string } | null> {
  const [row] = await db
    .update(clientAutopay)
    .set({
      enabled: true,
      provider: input.provider,
      paymentMethodId: input.paymentMethodId,
      cardBrand: input.brand,
      cardLast4: input.last4,
      cardExpMonth: input.expMonth,
      cardExpYear: input.expYear,
      enabledAt: sql`now()`,
      disabledAt: null,
      // A new card clears the old card's failures. The streak was about the
      // card, not about the client.
      consecutiveFailures: 0,
      lastFailureCode: null,
      setupRef: null,
      setupUrl: null,
      updatedAt: sql`now()`,
    })
    .where(eq(clientAutopay.setupRef, input.setupRef))
    .returning({ clientId: clientAutopay.clientId });

  if (!row) return null;

  // Every open invoice is un-noticed again.
  //
  // The stamp is what unlocks a charge, and it never expires on its own. A
  // client who turns AutoPay off in July, saves a new card in December and has
  // an invoice still open from September would otherwise be charged that night
  // on a three-month-old email — one that named a different card and a
  // different balance. Clearing it here puts them back behind the notice and
  // its day of grace, which is the whole point of both.
  await db
    .update(invoices)
    .set({ autopayNoticeSentAt: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(invoices.clientId, row.clientId),
        eq(invoices.status, "sent"),
        sql`${invoices.totalCents} - ${invoices.amountPaidCents} > 0`,
      ),
    );

  if (input.customerId) {
    // First time we have ever needed a customer for this client — a setup can
    // happen before they have paid anything at all.
    await db
      .update(clients)
      .set({ billingCustomerId: input.customerId, updatedAt: sql`now()` })
      .where(and(eq(clients.id, row.clientId), isNull(clients.billingCustomerId)));
  }

  await logActivity({
    actorType: "client",
    entityType: "client",
    entityId: row.clientId,
    action: "autopay.enabled",
    // Never the payment method id: it is a handle to a real card and the log is
    // read by more people than the billing code is.
    metadata: { brand: input.brand, last4: input.last4 },
  });

  return { clientId: row.clientId };
}

/**
 * The network reissued the card and Stripe followed it. Digits only — the
 * arrangement itself is untouched, which is the point of the card updater.
 */
export async function refreshSavedCard(input: {
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}): Promise<void> {
  await db
    .update(clientAutopay)
    .set({
      cardBrand: input.brand,
      cardLast4: input.last4,
      cardExpMonth: input.expMonth,
      cardExpYear: input.expYear,
      updatedAt: sql`now()`,
    })
    .where(eq(clientAutopay.paymentMethodId, input.paymentMethodId));
}

/**
 * The card was removed at Stripe's end. AutoPay goes off with it: leaving it on
 * with a dead handle would mean a client who believes they are covered and a
 * run that fails every night.
 */
export async function detachSavedCard(paymentMethodId: string): Promise<void> {
  const [row] = await db
    .update(clientAutopay)
    .set({
      enabled: false,
      paymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
      cardExpMonth: null,
      cardExpYear: null,
      disabledAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(clientAutopay.paymentMethodId, paymentMethodId))
    .returning({ clientId: clientAutopay.clientId });

  if (!row) return;

  await logActivity({
    actorType: "system",
    entityType: "client",
    entityId: row.clientId,
    action: "autopay.disabled",
    metadata: { reason: "payment_method_detached" },
  });
}

/**
 * Resolve a setup link back to the client it belongs to.
 *
 * Addressed by the unguessable ref alone, exactly like /pay/[ref] and the
 * tokenised invoice view: it is reached from a redirect, before any session
 * exists. The ref is 32 random hex characters from the provider, so it is not
 * guessable from another client's.
 */
export async function getAutopaySetupByRef(setupRef: string): Promise<{
  clientId: string;
  clientName: string;
  provider: string;
  setupCreatedAt: Date | null;
  alreadySaved: boolean;
} | null> {
  const [row] = await db
    .select({
      clientId: clientAutopay.clientId,
      clientName: clients.name,
      provider: clientAutopay.provider,
      setupCreatedAt: clientAutopay.setupCreatedAt,
      paymentMethodId: clientAutopay.paymentMethodId,
    })
    .from(clientAutopay)
    .innerJoin(clients, eq(clients.id, clientAutopay.clientId))
    .where(eq(clientAutopay.setupRef, setupRef))
    .limit(1);

  if (!row) return null;

  return {
    clientId: row.clientId,
    clientName: row.clientName,
    provider: row.provider,
    setupCreatedAt: row.setupCreatedAt,
    alreadySaved: row.paymentMethodId !== null,
  };
}

/**
 * The open attempt for an invoice, whatever PaymentIntent it ended up with.
 *
 * The fallback for the case findAttemptByPaymentIntent() cannot cover: the
 * attempt row is written BEFORE the provider is called, so a run that died
 * before hearing back left it with a null payment_intent_id — which is exactly
 * the situation the failure webhook exists to clean up. Without this the row
 * stays `started` for ever and that invoice is silently never charged again.
 */
export async function findOpenAttemptByInvoice(invoiceId: string): Promise<{
  attemptId: string;
  invoiceId: string;
  clientId: string;
  status: "started" | "succeeded" | "failed";
  amountCents: number;
  currency: string;
  idempotencyKey: string;
} | null> {
  const [row] = await db
    .select({
      attemptId: autopayAttempts.id,
      invoiceId: autopayAttempts.invoiceId,
      clientId: autopayAttempts.clientId,
      status: autopayAttempts.status,
      amountCents: autopayAttempts.amountCents,
      currency: autopayAttempts.currency,
      idempotencyKey: autopayAttempts.idempotencyKey,
    })
    .from(autopayAttempts)
    .where(and(eq(autopayAttempts.invoiceId, invoiceId), eq(autopayAttempts.status, "started")))
    .limit(1);

  return row ?? null;
}

/** Find the attempt a Stripe PaymentIntent belongs to. */
export async function findAttemptByPaymentIntent(paymentIntentId: string): Promise<{
  attemptId: string;
  invoiceId: string;
  clientId: string;
  status: "started" | "succeeded" | "failed";
  amountCents: number;
  currency: string;
  idempotencyKey: string;
} | null> {
  const [row] = await db
    .select({
      attemptId: autopayAttempts.id,
      invoiceId: autopayAttempts.invoiceId,
      clientId: autopayAttempts.clientId,
      status: autopayAttempts.status,
      amountCents: autopayAttempts.amountCents,
      currency: autopayAttempts.currency,
      idempotencyKey: autopayAttempts.idempotencyKey,
    })
    .from(autopayAttempts)
    .where(eq(autopayAttempts.paymentIntentId, paymentIntentId))
    .limit(1);

  return row ?? null;
}

/** Postgres `date` columns compare as 'YYYY-MM-DD', not as a Date. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
