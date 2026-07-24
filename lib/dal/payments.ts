import "server-only";

import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServices,
  payments,
  type BillingInterval,
  type ClientServiceStatus,
  type PaymentStatus,
} from "@/lib/db/schema";
import { nextBillFrom, summarize, type CurrencyTotal } from "@/lib/billing";
import {
  appUrl,
  getPaymentProvider,
  paymentsAreSimulated,
  type PaymentEvent,
} from "@/lib/payments";
import { requireSession } from "./session";
import { logActivity } from "./activity";
import { reconcilePaidService } from "./invoices";

/* ---------------------------------------------------------------------------
   Taking money.

   Two entry points, one destination:

     staff clicks "Payment link"  →  createCheckout()      → provider → link
     client pays                  →  applyPaymentSucceeded()

   applyPaymentSucceeded is called by the Stripe webhook AND by the simulated
   checkout page. They are the same function on purpose: whatever the simulator
   exercises today is exactly what runs when the real webhook arrives, so the
   switch to live Stripe changes who calls it and nothing about what it does.

   It is also the only place a service is allowed to go pending_payment →
   active. Nobody flips that by hand; the ledger and the status can't disagree.
--------------------------------------------------------------------------- */

export type CheckoutInfo = {
  url: string;
  ref: string;
  provider: string;
  createdAt: Date;
  simulated: boolean;
};

/**
 * Mint a payment link for one billing line and store it on that line.
 *
 * A draft line moves to "Awaiting payment" — the link has gone out, nothing has
 * cleared, and it must not count toward MRR until it does. An already-active
 * line keeps its status: sending a fresh link for an extra one-off charge is
 * not a reason to stop counting the revenue that's already recurring.
 */
export async function createCheckout(clientServiceId: string): Promise<CheckoutInfo> {
  const staff = await requireSession();

  const [line] = await db
    .select({
      id: clientServices.id,
      clientId: clientServices.clientId,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      unitAmountCents: clientServices.unitAmountCents,
      quantity: clientServices.quantity,
      currency: clientServices.currency,
      interval: clientServices.interval,
      status: clientServices.status,
      clientName: clients.name,
      clientEmail: clients.email,
      customerId: clients.billingCustomerId,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.clientId, clients.id))
    .where(eq(clientServices.id, clientServiceId))
    .limit(1);

  if (!line) throw new Error("NOT_FOUND");
  if (line.amountCents <= 0) throw new Error("ZERO_AMOUNT");
  if (line.status === "cancelled") throw new Error("LINE_CANCELLED");

  const provider = getPaymentProvider();
  const session = await provider.createCheckout({
    clientServiceId: line.id,
    clientId: line.clientId,
    label: line.label,
    amountCents: line.amountCents,
    // Defensive: a line predating the quantity backfill reads as 1 × the total.
    unitAmountCents: line.unitAmountCents || line.amountCents,
    quantity: line.quantity || 1,
    currency: line.currency,
    interval: line.interval,
    clientName: line.clientName,
    clientEmail: line.clientEmail,
    customerId: line.customerId,
    // {CHECKOUT_SESSION_ID} is Stripe's own template token, substituted by them
    // on redirect. The thank-you page it lands on confirms nothing: the payment
    // is real when the webhook says so, never because a browser reached a URL.
    successUrl: `${appUrl()}/pay/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/pay/cancelled`,
  });

  const createdAt = new Date();

  await db
    .update(clientServices)
    .set({
      paymentProvider: session.provider,
      checkoutRef: session.ref,
      checkoutUrl: session.url,
      checkoutCreatedAt: createdAt,
      status: line.status === "draft" ? "pending_payment" : line.status,
      updatedAt: createdAt,
    })
    .where(eq(clientServices.id, clientServiceId));

  // Remember the customer so the client's next service attaches to the same
  // record over at the provider instead of creating a second one.
  if (session.customerId && !line.customerId) {
    await db
      .update(clients)
      .set({ billingCustomerId: session.customerId })
      .where(eq(clients.id, line.clientId));
  }

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: line.clientId,
    action: "payment.link_created",
    metadata: {
      clientServiceId,
      provider: session.provider,
      amountCents: line.amountCents,
      currency: line.currency,
    },
  });

  return {
    url: session.url,
    ref: session.ref,
    provider: session.provider,
    createdAt,
    simulated: provider.simulated,
  };
}

/** Drop the outstanding link without touching the line's money or status. */
export async function clearCheckout(clientServiceId: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .update(clientServices)
    .set({
      checkoutRef: null,
      checkoutUrl: null,
      checkoutCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(clientServices.id, clientServiceId))
    .returning({ clientId: clientServices.clientId });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "payment.link_revoked",
    metadata: { clientServiceId },
  });

  return row;
}

/* ---------------------------------------------------------------------------
   Applying provider events

   No session: the caller is a webhook (or the simulator), and the actor is the
   system. Authorization for the webhook is its signature, checked in the route
   before anything here is called.
--------------------------------------------------------------------------- */

export type ApplyResult = {
  applied: boolean;
  clientId: string | null;
  /** False when this provider ref was already processed — a retried webhook. */
  duplicate?: boolean;
};

export async function applyPaymentSucceeded(event: PaymentEvent): Promise<ApplyResult> {
  const [line] = await db
    .select({
      id: clientServices.id,
      clientId: clientServices.clientId,
      label: clientServices.label,
      interval: clientServices.interval,
      status: clientServices.status,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
    })
    .from(clientServices)
    .where(eq(clientServices.id, event.clientServiceId))
    .limit(1);

  if (!line) return { applied: false, clientId: null };

  // The unique index on provider_ref is what makes this idempotent, not the
  // check-then-insert around it: Stripe retries deliveries, and two retries can
  // land at the same moment. No row back = we have already handled this event.
  const [ledgerRow] = await db
    .insert(payments)
    .values({
      clientId: line.clientId,
      clientServiceId: line.id,
      provider: event.provider,
      providerRef: event.providerRef,
      status: "succeeded",
      amountCents: event.amountCents || line.amountCents,
      currency: (event.currency || line.currency).toUpperCase(),
      description: event.description ?? line.label,
      paidAt: event.paidAt,
    })
    .onConflictDoNothing({ target: payments.providerRef })
    .returning({ id: payments.id });

  if (!ledgerRow) return { applied: false, clientId: line.clientId, duplicate: true };

  // Money cleared, so the line is live and its clock starts from the payment.
  // A cancelled line is left cancelled — a late-settling payment on something
  // the client already ended must not quietly resurrect the subscription.
  const set: Record<string, unknown> = {
    lastPaymentAt: event.paidAt,
    updatedAt: new Date(),
  };

  if (line.status !== "cancelled") {
    set.status = "active";
    set.nextBillAt =
      line.interval === "one_off" ? null : nextBillFrom(event.paidAt, line.interval);
    if (event.subscriptionId) set.externalSubscriptionId = event.subscriptionId;
  }

  await db.update(clientServices).set(set).where(eq(clientServices.id, line.id));

  // Billing changes are changes — keep the client's "last updated" honest.
  await db.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, line.clientId));

  if (event.customerId) {
    await db
      .update(clients)
      .set({ billingCustomerId: event.customerId })
      .where(and(eq(clients.id, line.clientId), sql`${clients.billingCustomerId} is null`));
  }

  await logActivity({
    actorType: "system",
    entityType: "client",
    entityId: line.clientId,
    action: "payment.succeeded",
    metadata: {
      clientServiceId: line.id,
      label: line.label,
      amountCents: event.amountCents || line.amountCents,
      currency: event.currency || line.currency,
      provider: event.provider,
      providerRef: event.providerRef,
    },
  });

  // Settle the invoice this payment covers, if there is one. Best-effort by
  // design: an invoice edge case must never fail a payment that has cleared, so
  // it is wrapped and swallowed — the ledger row above is the record of truth,
  // and reconciliation only joins it to the document it pays.
  try {
    await reconcilePaidService({
      clientServiceId: line.id,
      paymentId: ledgerRow.id,
      amountCents: event.amountCents || line.amountCents,
      paidAt: event.paidAt,
    });
  } catch (error) {
    console.error("[applyPaymentSucceeded] invoice reconcile failed", error);
  }

  return { applied: true, clientId: line.clientId };
}

export async function applyPaymentFailed(input: {
  clientServiceId: string;
  providerRef: string;
  provider: string;
  reason: string;
}): Promise<ApplyResult> {
  const [line] = await db
    .select({
      id: clientServices.id,
      clientId: clientServices.clientId,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
    })
    .from(clientServices)
    .where(eq(clientServices.id, input.clientServiceId))
    .limit(1);

  if (!line) return { applied: false, clientId: null };

  const [ledgerRow] = await db
    .insert(payments)
    .values({
      clientId: line.clientId,
      clientServiceId: line.id,
      provider: input.provider,
      providerRef: input.providerRef,
      status: "failed",
      amountCents: line.amountCents,
      currency: line.currency,
      description: line.label,
      failureReason: input.reason,
    })
    .onConflictDoNothing({ target: payments.providerRef })
    .returning({ id: payments.id });

  if (!ledgerRow) return { applied: false, clientId: line.clientId, duplicate: true };

  await logActivity({
    actorType: "system",
    entityType: "client",
    entityId: line.clientId,
    action: "payment.failed",
    metadata: { clientServiceId: line.id, label: line.label, reason: input.reason },
  });

  return { applied: true, clientId: line.clientId };
}

/** The provider says the subscription is over — mirror it, don't argue with it. */
export async function applySubscriptionCancelled(input: {
  clientServiceId: string;
  providerRef: string;
}): Promise<ApplyResult> {
  const [row] = await db
    .update(clientServices)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      nextBillAt: null,
      updatedAt: new Date(),
    })
    .where(eq(clientServices.id, input.clientServiceId))
    .returning({ clientId: clientServices.clientId, label: clientServices.label });

  if (!row) return { applied: false, clientId: null };

  await logActivity({
    actorType: "system",
    entityType: "client",
    entityId: row.clientId,
    action: "payment.subscription_cancelled",
    metadata: { clientServiceId: input.clientServiceId, label: row.label },
  });

  return { applied: true, clientId: row.clientId };
}

/* ---------------------------------------------------------------------------
   The simulated checkout page (/pay/[ref])

   Public: the link goes to a client, who has no admin session. It therefore
   exposes the bare minimum — what they're paying, how much, and who to. The
   32-hex ref is the only credential, which is the same trust model as a real
   Stripe Checkout URL.
--------------------------------------------------------------------------- */

export type PublicCheckout = {
  ref: string;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  clientName: string;
  status: ClientServiceStatus;
  /** Already settled — the page says so instead of taking a second payment. */
  paid: boolean;
  simulated: boolean;
};

export async function getCheckoutByRef(ref: string): Promise<PublicCheckout | null> {
  // Cheap shape check before touching the database — the ref is user input.
  // Covers both `mock_cs_<32 hex>` and Stripe's `cs_test_…` / `cs_live_…`.
  if (!/^[a-z]+_[a-z0-9]+_[a-zA-Z0-9]{8,120}$/.test(ref)) return null;

  const [row] = await db
    .select({
      ref: clientServices.checkoutRef,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      status: clientServices.status,
      lastPaymentAt: clientServices.lastPaymentAt,
      checkoutCreatedAt: clientServices.checkoutCreatedAt,
      provider: clientServices.paymentProvider,
      clientName: clients.name,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.clientId, clients.id))
    .where(eq(clientServices.checkoutRef, ref))
    .limit(1);

  if (!row?.ref) return null;

  // Paid means: settled since this link was minted. An older payment on a
  // recurring line doesn't make the current cycle's link stale.
  const paid = Boolean(
    row.lastPaymentAt &&
      row.checkoutCreatedAt &&
      row.lastPaymentAt.getTime() >= row.checkoutCreatedAt.getTime(),
  );

  return {
    ref: row.ref,
    label: row.label,
    amountCents: row.amountCents,
    currency: row.currency,
    interval: row.interval,
    clientName: row.clientName,
    status: row.status,
    paid,
    simulated: row.provider !== "stripe",
  };
}

/**
 * "Pay" on the simulated checkout. Refuses to run against a Stripe-minted ref
 * even if the env is later switched back to mock — the one thing this must
 * never do is mark a real, unpaid Stripe invoice as settled.
 */
export async function simulatePayment(ref: string): Promise<ApplyResult> {
  // Both guards matter. The prefix stops a Stripe session from ever being
  // settled here; the mode check stops an old simulated link from booking
  // revenue after the switch to live payments, when it never would be paid.
  if (!ref.startsWith("mock_")) throw new Error("NOT_SIMULATED");
  if (!paymentsAreSimulated()) throw new Error("NOT_SIMULATED");

  const [line] = await db
    .select({
      id: clientServices.id,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      label: clientServices.label,
      lastPaymentAt: clientServices.lastPaymentAt,
      checkoutCreatedAt: clientServices.checkoutCreatedAt,
    })
    .from(clientServices)
    .where(eq(clientServices.checkoutRef, ref))
    .limit(1);

  if (!line) throw new Error("NOT_FOUND");

  // Pressing "Pay" twice must not book the money twice. Every simulated payment
  // mints its own event ref, so the unique index downstream cannot catch this
  // one — the guard has to be here.
  if (
    line.lastPaymentAt &&
    line.checkoutCreatedAt &&
    line.lastPaymentAt.getTime() >= line.checkoutCreatedAt.getTime()
  ) {
    throw new Error("ALREADY_PAID");
  }

  return applyPaymentSucceeded({
    provider: "mock",
    providerRef: `mock_evt_${randomBytes(16).toString("hex")}`,
    clientServiceId: line.id,
    amountCents: line.amountCents,
    currency: line.currency,
    paidAt: new Date(),
    subscriptionId: `mock_sub_${line.id.slice(0, 8)}`,
    description: `${line.label} (simulated)`,
  });
}

/* ---------------------------------------------------------------------------
   Reads for the dashboard and the client page
--------------------------------------------------------------------------- */

export type PaymentItem = {
  id: string;
  clientId: string;
  clientName: string;
  clientServiceId: string | null;
  provider: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  description: string | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
};

export async function listClientPayments(clientId: string): Promise<PaymentItem[]> {
  await requireSession();

  return db
    .select({
      id: payments.id,
      clientId: payments.clientId,
      clientName: clients.name,
      clientServiceId: payments.clientServiceId,
      provider: payments.provider,
      status: payments.status,
      amountCents: payments.amountCents,
      currency: payments.currency,
      description: payments.description,
      paidAt: payments.paidAt,
      failureReason: payments.failureReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(clients, eq(payments.clientId, clients.id))
    .where(eq(payments.clientId, clientId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
}

export type PaymentsOverview = {
  /** Succeeded payments with paid_at in the current calendar month, per currency. */
  collectedThisMonth: CurrencyTotal[];
  collectedLastMonth: CurrencyTotal[];
  /** Lines sitting on "Awaiting payment" — sent, not settled. */
  outstanding: CurrencyTotal[];
  outstandingLines: number;
  failedRecently: number;
  recent: PaymentItem[];
};

export async function getPaymentsOverview(): Promise<PaymentsOverview> {
  await requireSession();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [thisMonthRows, lastMonthRows, outstandingRows, [{ failedRecently }], recent] =
    await Promise.all([
      db
        .select({ amountCents: payments.amountCents, currency: payments.currency })
        .from(payments)
        .where(
          and(
            eq(payments.status, "succeeded"),
            isNotNull(payments.paidAt),
            gte(payments.paidAt, monthStart),
          ),
        ),
      db
        .select({ amountCents: payments.amountCents, currency: payments.currency })
        .from(payments)
        .where(
          and(
            eq(payments.status, "succeeded"),
            isNotNull(payments.paidAt),
            gte(payments.paidAt, lastMonthStart),
            lt(payments.paidAt, monthStart),
          ),
        ),
      db
        .select({
          amountCents: clientServices.amountCents,
          currency: clientServices.currency,
          interval: clientServices.interval,
        })
        .from(clientServices)
        .where(eq(clientServices.status, "pending_payment")),
      db
        .select({ failedRecently: count() })
        .from(payments)
        .where(and(eq(payments.status, "failed"), gte(payments.createdAt, thirtyDaysAgo))),
      db
        .select({
          id: payments.id,
          clientId: payments.clientId,
          clientName: clients.name,
          clientServiceId: payments.clientServiceId,
          provider: payments.provider,
          status: payments.status,
          amountCents: payments.amountCents,
          currency: payments.currency,
          description: payments.description,
          paidAt: payments.paidAt,
          failureReason: payments.failureReason,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(clients, eq(payments.clientId, clients.id))
        .orderBy(desc(payments.createdAt))
        .limit(12),
    ]);

  // Collected money is what it is — a one-off and a monthly charge that both
  // cleared are both cash in the account, so they are summed as face value
  // rather than normalized to a monthly rate.
  const asOneOff = (rows: { amountCents: number; currency: string }[]) =>
    summarize(rows.map((r) => ({ ...r, interval: "one_off" as const })));

  return {
    collectedThisMonth: asOneOff(thisMonthRows),
    collectedLastMonth: asOneOff(lastMonthRows),
    // Outstanding is what we've asked for and not been paid: the face amount of
    // the next charge on each waiting line, not its monthly equivalent. "$300
    // quarterly, awaiting payment" is $300 owed, not $100.
    outstanding: asOneOff(outstandingRows),
    outstandingLines: outstandingRows.length,
    failedRecently,
    recent,
  };
}
