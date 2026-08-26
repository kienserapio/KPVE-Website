import "server-only";

import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  clientServices,
  invoiceLines,
  invoices,
  payments,
  type BillingInterval,
  type ClientServiceStatus,
  type PaymentStatus,
} from "@/lib/db/schema";
import { nextBillFrom, safeTerm, summarize, type CurrencyTotal } from "@/lib/billing";
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
      termCount: clientServices.termCount,
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
    // The price of one FOR ONE CHARGE. On a two-year line the client is billed
    // the two-year price of each domain every two years, so the term belongs in
    // the unit — Stripe multiplies it by the quantity, not by interval_count.
    // Defensive: a line predating the quantity backfill reads as 1 × the total.
    unitAmountCents:
      (line.unitAmountCents || line.amountCents) * safeTerm(line.termCount),
    quantity: line.quantity || 1,
    currency: line.currency,
    interval: line.interval,
    termCount: line.termCount,
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
  // record over at the provider instead of creating a second one. `replaced`
  // overwrites a stored id the provider has just rejected — the test-mode
  // `cus_…` left behind by the switch to live keys.
  if (session.customerId && (!line.customerId || session.replacedCustomer)) {
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

/* ---------------------------------------------------------------------------
   Paying an invoice by card.

   This is the path that makes the document collectable rather than merely
   printable, and it differs from the service link above in two ways that both
   matter:

     1. It charges the INVOICE TOTAL, once. Two years of a $44/mo line is a
        single $1,056 charge, GST included, not a subscription — the recurrence
        is already priced into the number on the paper.

     2. It is minted when the CLIENT presses "Pay now", not when staff press
        "Send". A Stripe Checkout Session expires in 24 hours; an invoice sent
        on Monday gets opened on Thursday. Minting at send time would email out
        a link that is dead before it is used, which is worse than no button.

   No session check: the caller is the client's own copy of the invoice, holding
   the unguessable token — exactly the trust model /pay/[ref] already runs on.
   The token is verified by the action before this is reached, and every rule
   about WHETHER this invoice can be paid is enforced here rather than there.
--------------------------------------------------------------------------- */

export async function createInvoiceCheckout(invoiceId: string): Promise<CheckoutInfo> {
  const [invoice] = await db
    .select({
      id: invoices.id,
      clientId: invoices.clientId,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      billToEmail: invoices.billToEmail,
      clientName: clients.name,
      clientEmail: clients.email,
      customerId: clients.billingCustomerId,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) throw new Error("NOT_FOUND");
  // A draft is not a document yet and a void one is a closed record. Only a
  // sent invoice is a thing anyone has been asked to pay.
  if (invoice.status !== "sent") throw new Error("NOT_PAYABLE");

  const dueCents = invoice.totalCents - invoice.amountPaidCents;
  if (dueCents <= 0) throw new Error("ALREADY_PAID");

  const provider = getPaymentProvider();
  const session = await provider.createCheckout({
    invoiceId: invoice.id,
    clientId: invoice.clientId,
    label: `Invoice ${invoice.number}`,
    // Quantity 1 at the full balance: the itemisation is on the invoice, and
    // splitting it again at the checkout would only invite the two to disagree.
    amountCents: dueCents,
    unitAmountCents: dueCents,
    quantity: 1,
    currency: invoice.currency,
    interval: "one_off",
    clientName: invoice.clientName,
    // Whoever is named on the document is who receives the receipt.
    clientEmail: invoice.billToEmail || invoice.clientEmail,
    customerId: invoice.customerId,
    successUrl: `${appUrl()}/pay/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl()}/pay/cancelled`,
  });

  const createdAt = new Date();

  await db
    .update(invoices)
    .set({
      paymentProvider: session.provider,
      checkoutRef: session.ref,
      checkoutUrl: session.url,
      checkoutCreatedAt: createdAt,
      updatedAt: createdAt,
    })
    .where(eq(invoices.id, invoice.id));

  if (session.customerId && (!invoice.customerId || session.replacedCustomer)) {
    await db
      .update(clients)
      .set({ billingCustomerId: session.customerId })
      .where(eq(clients.id, invoice.clientId));
  }

  // "system", not "staff": nobody on the team pressed this — the client did.
  await logActivity({
    actorType: "system",
    entityType: "invoice",
    entityId: invoice.id,
    action: "invoice.checkout_started",
    metadata: {
      number: invoice.number,
      provider: session.provider,
      amountCents: dueCents,
      currency: invoice.currency,
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

/**
 * Everything the payment-link email needs, read back from the line itself.
 *
 * A separate read rather than trusting what the browser holds: the URL, the
 * amount and the address the mail goes to are all things the client component
 * could hand over, and none of them should be taken from it. The link is a
 * request for money — where it goes and what it says is decided here.
 */
export type PaymentLinkRecipient = {
  clientId: string;
  clientName: string;
  clientEmail: string;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  termCount: number;
  url: string;
  simulated: boolean;
};

export async function getPaymentLinkRecipient(
  clientServiceId: string,
): Promise<PaymentLinkRecipient> {
  await requireSession();

  const [row] = await db
    .select({
      clientId: clientServices.clientId,
      clientName: clients.name,
      clientEmail: clients.email,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      termCount: clientServices.termCount,
      status: clientServices.status,
      url: clientServices.checkoutUrl,
      provider: clientServices.paymentProvider,
    })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.clientId, clients.id))
    .where(eq(clientServices.id, clientServiceId))
    .limit(1);

  if (!row) throw new Error("NOT_FOUND");
  // No link means there is nothing to send. Mint one first.
  if (!row.url) throw new Error("NO_LINK");
  if (row.status === "cancelled") throw new Error("LINE_CANCELLED");
  if (!row.clientEmail) throw new Error("NO_EMAIL");

  return {
    clientId: row.clientId,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    label: row.label,
    amountCents: row.amountCents,
    currency: row.currency,
    interval: row.interval,
    termCount: row.termCount,
    url: row.url,
    // Same rule the panel uses: anything that isn't Stripe is the simulator.
    simulated: row.provider !== "stripe",
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
  // An invoice payment settles a document and everything under it; a service
  // payment settles one line. The webhook can't tell them apart — the metadata
  // on the event can, and did.
  if (event.invoiceId) return applyInvoicePaymentSucceeded(event);
  if (!event.clientServiceId) return { applied: false, clientId: null };

  const [line] = await db
    .select({
      id: clientServices.id,
      clientId: clientServices.clientId,
      label: clientServices.label,
      interval: clientServices.interval,
      termCount: clientServices.termCount,
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
    // A charge on a two-year line buys two years — the next one is 2028.
    set.nextBillAt =
      line.interval === "one_off"
        ? null
        : nextBillFrom(event.paidAt, line.interval, undefined, line.termCount);
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

/* ---------------------------------------------------------------------------
   An invoice was paid.

   Same contract as the function above — idempotent on provider_ref, writes the
   ledger first, never trusts the caller — but it settles a DOCUMENT, and a
   document can cover more than one line and more than one cycle.

   The part that makes prepayment real is rolling each covered line forward to
   the END of what was bought. A client who pays two years up front must not
   reappear in "upcoming bills" next month; their next charge is in 2028, and
   the invoice line's own period end is the record of when. Nothing here touches
   the RATE — the line is still $44/mo and still contributes $44 to MRR, which
   is what monthly revenue recognition means.
--------------------------------------------------------------------------- */

async function applyInvoicePaymentSucceeded(event: PaymentEvent): Promise<ApplyResult> {
  const invoiceId = event.invoiceId!;

  const [invoice] = await db
    .select({
      id: invoices.id,
      clientId: invoices.clientId,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoice) return { applied: false, clientId: null };

  const amountCents = event.amountCents || invoice.totalCents - invoice.amountPaidCents;

  // The lines this invoice bought, and how long each was paid for.
  const lines = await db
    .select({
      clientServiceId: invoiceLines.clientServiceId,
      periodEnd: invoiceLines.periodEnd,
    })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));

  const serviceIds = [
    ...new Set(lines.map((l) => l.clientServiceId).filter((id): id is string => Boolean(id))),
  ];

  const [ledgerRow] = await db
    .insert(payments)
    .values({
      clientId: invoice.clientId,
      // Only when the invoice IS that one line. Attributing a multi-line
      // payment to whichever line happened to be first would misreport every
      // per-service revenue number that reads this column.
      clientServiceId: serviceIds.length === 1 ? serviceIds[0] : null,
      invoiceId: invoice.id,
      provider: event.provider,
      providerRef: event.providerRef,
      status: "succeeded",
      amountCents,
      currency: (event.currency || invoice.currency).toUpperCase(),
      description: event.description ?? `Invoice ${invoice.number}`,
      paidAt: event.paidAt,
    })
    .onConflictDoNothing({ target: payments.providerRef })
    .returning({ id: payments.id });

  if (!ledgerRow) return { applied: false, clientId: invoice.clientId, duplicate: true };

  // Void is terminal and stays terminal: money arriving against a cancelled
  // document is a refund conversation, not a reason to un-void it. The ledger
  // row above still records that it arrived.
  if (invoice.status === "paid") {
    // The ledger row above still records that the money arrived — refusing to
    // write it would be worse than anything. What must not happen is the
    // invoice quietly climbing past its own total: that is an overpayment, and
    // an overpayment is a refund conversation with a human in it.
    console.error("[payments] money arrived for an invoice already paid", {
      invoiceId: invoice.id,
      amountCents,
      providerRef: event.providerRef,
    });
    await logActivity({
      actorType: "system",
      entityType: "invoice",
      entityId: invoice.id,
      action: "invoice.overpaid",
      metadata: { amountCents, provider: event.provider },
    });
  } else if (invoice.status !== "void") {
    // Every value here is computed by Postgres from the row as it stands at
    // write time, NOT from the copy read at the top of this function.
    //
    // Two payments landing on one invoice at once — which AutoPay makes real,
    // because a nightly run and a client pressing Pay now are two writers where
    // there used to be one — would otherwise both read the same
    // `amount_paid_cents`, both add their own amount to it, and both store the
    // result. One increment disappears: the money is taken twice, two ledger
    // rows say so, and the invoice quietly claims to have received half of it.
    const paidCents = sql`${invoices.amountPaidCents} + ${amountCents}`;
    const settled = sql`${invoices.amountPaidCents} + ${amountCents} >= ${invoices.totalCents}`;

    await db
      .update(invoices)
      .set({
        status: sql`case when ${settled} then 'paid'::invoice_status else ${invoices.status} end`,
        amountPaidCents: paidCents,
        // ISO string, not the Date itself: a bare Date bound inside a raw sql
        // fragment does not go through the column's encoder and the driver
        // rejects the statement.
        paidAt: sql`case when ${settled} then ${event.paidAt.toISOString()}::timestamptz else null end`,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));
  }

  // Roll every covered line forward. `period_end` is the last day the client
  // has paid for, so the next charge is the day after it — for a two-year
  // invoice that is two years out, which is the whole point of paying up front.
  for (const line of lines) {
    if (!line.clientServiceId) continue;

    const [service] = await db
      .select({
        status: clientServices.status,
        interval: clientServices.interval,
        termCount: clientServices.termCount,
      })
      .from(clientServices)
      .where(eq(clientServices.id, line.clientServiceId))
      .limit(1);
    if (!service) continue;

    const set: Record<string, unknown> = {
      lastPaymentAt: event.paidAt,
      updatedAt: new Date(),
    };

    // A cancelled line stays cancelled — settling an old invoice must not
    // quietly restart something the client already ended.
    if (service.status !== "cancelled") {
      set.status = "active";
      set.nextBillAt =
        service.interval === "one_off"
          ? null
          : line.periodEnd
            ? dayAfter(line.periodEnd)
            : nextBillFrom(event.paidAt, service.interval, undefined, service.termCount);
    }

    await db.update(clientServices).set(set).where(eq(clientServices.id, line.clientServiceId));
  }

  await db.update(clients).set({ updatedAt: new Date() }).where(eq(clients.id, invoice.clientId));

  if (event.customerId) {
    await db
      .update(clients)
      .set({ billingCustomerId: event.customerId })
      .where(and(eq(clients.id, invoice.clientId), sql`${clients.billingCustomerId} is null`));
  }

  await logActivity({
    actorType: "system",
    entityType: "invoice",
    entityId: invoice.id,
    action: "invoice.paid",
    metadata: {
      number: invoice.number,
      via: "checkout",
      amountCents,
      currency: event.currency || invoice.currency,
      provider: event.provider,
      providerRef: event.providerRef,
      paymentId: ledgerRow.id,
    },
  });

  return { applied: true, clientId: invoice.clientId };
}

/** A `date` column ('YYYY-MM-DD') → local midnight the following day. */
function dayAfter(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date;
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
  /** What the ref points at — a billing line, or a whole invoice. */
  kind: "service" | "invoice";
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  /** Cycles per charge — "every 2 years" rather than "annually". */
  termCount: number;
  clientName: string;
  status: ClientServiceStatus | null;
  /** Already settled — the page says so instead of taking a second payment. */
  paid: boolean;
  simulated: boolean;
};

export async function getCheckoutByRef(ref: string): Promise<PublicCheckout | null> {
  // Cheap shape check before touching the database — the ref is user input.
  // Covers both `mock_cs_<32 hex>` and Stripe's `cs_test_…` / `cs_live_…`.
  if (!/^[a-z]+_[a-z0-9]+_[a-zA-Z0-9]{8,120}$/.test(ref)) return null;

  const service = await getServiceCheckoutByRef(ref);
  if (service) return service;
  return getInvoiceCheckoutByRef(ref);
}

async function getServiceCheckoutByRef(ref: string): Promise<PublicCheckout | null> {
  const [row] = await db
    .select({
      ref: clientServices.checkoutRef,
      label: clientServices.label,
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      termCount: clientServices.termCount,
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
    kind: "service",
    termCount: row.termCount,
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
 * The same page, for an invoice checkout. An invoice is always a single charge
 * for a fixed amount, so it presents as a one-off however the lines underneath
 * it recur — and "paid" is a property of the DOCUMENT here, not of when the
 * link was minted: an invoice settled by bank transfer must stop offering a
 * card payment too.
 */
async function getInvoiceCheckoutByRef(ref: string): Promise<PublicCheckout | null> {
  const [row] = await db
    .select({
      ref: invoices.checkoutRef,
      number: invoices.number,
      status: invoices.status,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      currency: invoices.currency,
      provider: invoices.paymentProvider,
      billToName: invoices.billToName,
    })
    .from(invoices)
    .where(eq(invoices.checkoutRef, ref))
    .limit(1);

  if (!row?.ref) return null;

  const dueCents = row.totalCents - row.amountPaidCents;

  return {
    ref: row.ref,
    kind: "invoice",
    termCount: 1,
    label: `Invoice ${row.number}`,
    amountCents: dueCents > 0 ? dueCents : row.totalCents,
    currency: row.currency,
    interval: "one_off",
    clientName: row.billToName,
    status: null,
    paid: row.status === "paid" || dueCents <= 0,
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

  // Not a billing line — it may be an invoice checkout, which settles a whole
  // document instead. Same simulator, same downstream code path.
  if (!line) return simulateInvoicePayment(ref);

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

/** The invoice half of the simulator. Only reached from simulatePayment above. */
async function simulateInvoicePayment(ref: string): Promise<ApplyResult> {
  const [invoice] = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      currency: invoices.currency,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
    })
    .from(invoices)
    .where(eq(invoices.checkoutRef, ref))
    .limit(1);

  if (!invoice) throw new Error("NOT_FOUND");

  // Same reason as above: each simulated payment mints its own event ref, so
  // the unique index can't catch a double press. Here the invoice's own balance
  // is the guard, which also covers a payment taken by bank transfer meanwhile.
  const dueCents = invoice.totalCents - invoice.amountPaidCents;
  if (invoice.status === "paid" || dueCents <= 0) throw new Error("ALREADY_PAID");
  if (invoice.status !== "sent") throw new Error("NOT_PAYABLE");

  return applyPaymentSucceeded({
    provider: "mock",
    providerRef: `mock_evt_${randomBytes(16).toString("hex")}`,
    invoiceId: invoice.id,
    amountCents: dueCents,
    currency: invoice.currency,
    paidAt: new Date(),
    description: `Invoice ${invoice.number} (simulated)`,
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
