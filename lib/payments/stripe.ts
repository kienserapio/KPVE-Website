import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { BillingInterval } from "@/lib/db/schema";
import {
  PaymentProviderError,
  type ChargeResult,
  type CheckoutRequest,
  type CheckoutSession,
  type OffSessionCharge,
  type PaymentEvent,
  type PaymentProvider,
  type SavedCard,
  type SetupRequest,
  type SetupSession,
} from "./types";

/* ---------------------------------------------------------------------------
   Stripe, over the REST API with fetch.

   Deliberately no `stripe` npm package. The three calls this CRM needs
   (create a Checkout Session, verify a webhook, read an event) are a hundred
   lines against a stable, versioned HTTP API — against a dependency that ships
   its own retry logic, its own fetch shim and a megabyte of TypeScript for the
   other four hundred endpoints. Pinning the API version below is what actually
   protects us from Stripe changing shape underneath.

   Nothing here runs until STRIPE_SECRET_KEY is set; see lib/payments/index.ts.
--------------------------------------------------------------------------- */

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Pinned on purpose. Stripe rolls the account's default version forward over
 * time; sending it explicitly means an account-level change can never alter
 * the shape of a response this code is parsing.
 */
const STRIPE_API_VERSION = "2025-10-29.clover";

/**
 * Our intervals → Stripe's `recurring` shape. Stripe has no "quarterly", so a
 * quarter is three months — the same thing our own maths means by it.
 */
const STRIPE_RECURRING: Record<
  Exclude<BillingInterval, "one_off">,
  { interval: string; interval_count: number }
> = {
  weekly: { interval: "week", interval_count: 1 },
  monthly: { interval: "month", interval_count: 1 },
  quarterly: { interval: "month", interval_count: 3 },
  annually: { interval: "year", interval_count: 1 },
};

/**
 * A term multiplies the billing period: `annually` with a term of 2 is Stripe's
 * `{ interval: "year", interval_count: 2 }`, a real subscription that charges
 * once every two years. This is the whole point of the field — the alternative
 * was a yearly subscription for a two-year registration.
 *
 * Stripe caps a billing period at three years. lib/billing.ts clamps terms to
 * the same limit on the way in, so this should never bind; it is here because
 * a rejected session at checkout time is a far worse place to find out.
 */
const STRIPE_MAX_COUNT: Record<string, number> = { week: 156, month: 36, year: 3 };

function stripeRecurring(interval: Exclude<BillingInterval, "one_off">, term: number) {
  const base = STRIPE_RECURRING[interval];
  const cycles = Number.isFinite(term) && term >= 1 ? Math.trunc(term) : 1;
  const count = base.interval_count * cycles;
  return {
    interval: base.interval,
    interval_count: Math.min(count, STRIPE_MAX_COUNT[base.interval] ?? count),
  };
}

/* ---------------------------------------------------------------------------
   Form encoding

   Stripe's API takes application/x-www-form-urlencoded with bracket notation
   for nesting: line_items[0][price_data][unit_amount]=1100. Nothing in the
   standard URLSearchParams does that, so flatten first.
--------------------------------------------------------------------------- */

type Encodable = string | number | boolean | null | undefined | Encodable[] | { [k: string]: Encodable };

function flatten(value: Encodable, prefix = "", out: string[][] = []): string[][] {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
    return out;
  }

  if (typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      flatten(inner, prefix ? `${prefix}[${key}]` : key, out);
    }
    return out;
  }

  out.push([prefix, String(value)]);
  return out;
}

async function stripeRequest<T>(
  path: string,
  body: Record<string, Encodable>,
  secretKey: string,
  options: {
    /**
     * Stripe stores the first response for a key for 24 hours and replays it
     * for any retry carrying the same one. This is what makes a charge safe to
     * repeat after a lost response: the retry returns the original
     * PaymentIntent instead of creating a second one. Only ever set from a
     * value derived from what is being paid — never a timestamp.
     */
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body: new URLSearchParams(flatten(body)).toString(),
    // Never cached: this is a write, and a cached checkout session would be a
    // second client paying against the first one's link.
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; type?: string } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `Stripe returned ${response.status}`;
    throw new PaymentProviderError(message, payload?.error);
  }

  return payload as T;
}

/**
 * The read side. Separate from stripeRequest because a GET carries no body and
 * must never carry an idempotency key — Stripe ignores them on reads, and a key
 * on a read is a sign someone has copied the wrong helper.
 */
async function stripeGet<T>(path: string, secretKey: string): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; type?: string } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `Stripe returned ${response.status}`;
    throw new PaymentProviderError(message, payload?.error);
  }

  return payload as T;
}

/* ---------------------------------------------------------------------------
   Provider
--------------------------------------------------------------------------- */

type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  expires_at?: number;
};

type StripePaymentMethod = {
  id: string;
  card?: {
    brand?: string | null;
    last4?: string | null;
    exp_month?: number | null;
    exp_year?: number | null;
  } | null;
};

type StripePaymentIntent = {
  id: string;
  status: string;
  amount?: number;
  currency?: string;
};

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  readonly simulated = false;

  constructor(private readonly secretKey: string) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    // An invoice is a fixed amount due, so it is ALWAYS a single charge — the
    // recurrence of the services behind it is already priced into the total.
    const recurring =
      request.invoiceId || request.interval === "one_off"
        ? undefined
        : stripeRecurring(request.interval, request.termCount ?? 1);

    // Our ids travel with the session so the webhook can find the billing line
    // without trusting anything in the URL. For a subscription they go on the
    // subscription too — renewal invoices arrive months later and reference
    // only that, not the checkout that started it.
    //
    // `kpve_invoice_id` is deliberately not `invoice_id`: Stripe's own invoice
    // objects carry ids of that name, and a webhook handler reading the wrong
    // one would settle the wrong document.
    const metadata = {
      client_service_id: request.clientServiceId ?? undefined,
      kpve_invoice_id: request.invoiceId ?? undefined,
      client_id: request.clientId,
    };

    const body: Record<string, Encodable> = {
      mode: recurring ? "subscription" : "payment",
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.clientServiceId ?? request.invoiceId,
      metadata,
      line_items: [
        {
          // Itemised: Stripe shows "4 × $11.00", and for a subscription the
          // quantity is what a renewal multiplies, so both the total and the
          // receipt read the way the invoice does.
          quantity: request.quantity,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: request.unitAmountCents,
            product_data: { name: request.label },
            ...(recurring ? { recurring } : {}),
          },
        },
      ],
      ...(recurring
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
    };

    // A known customer is reused; a new one gets created from their email so
    // the second service they buy attaches to the same customer record. The
    // prefix check matters: a client billed during simulated mode may carry an
    // id from another provider, and Stripe would reject it as unknown.
    const reusingCustomer = Boolean(request.customerId?.startsWith("cus_"));
    if (reusingCustomer) {
      body.customer = request.customerId;
    } else {
      body.customer_email = request.clientEmail;
      if (!recurring) body.customer_creation = "always";
    }

    let replacedCustomer = false;
    let session: StripeCheckoutSession;
    try {
      session = await stripeRequest<StripeCheckoutSession>(
        "/checkout/sessions",
        body,
        this.secretKey,
      );
    } catch (error) {
      // The one recoverable failure: the customer we referenced isn't in this
      // Stripe account. That is exactly what a test-mode `cus_…` looks like the
      // day the live keys go in, and it would otherwise block every payment for
      // that client with an error nobody could act on. Retry once as a new
      // customer and tell the caller to forget the old id.
      if (!reusingCustomer || !isMissingCustomer(error)) throw error;

      console.warn(
        "[stripe] stored customer id was rejected — creating a new customer for this checkout",
      );
      delete body.customer;
      body.customer_email = request.clientEmail;
      if (!recurring) body.customer_creation = "always";

      session = await stripeRequest<StripeCheckoutSession>(
        "/checkout/sessions",
        body,
        this.secretKey,
      );
      replacedCustomer = true;
    }

    if (!session.url) {
      throw new PaymentProviderError("Stripe created the session but returned no URL.");
    }

    return {
      provider: "stripe",
      ref: session.id,
      url: session.url,
      customerId: session.customer,
      replacedCustomer,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    };
  }

  /* -------------------------------------------------------------------------
     AutoPay
  ------------------------------------------------------------------------- */

  /**
   * A Checkout Session in `mode: "setup"` — the card form with no amount on it.
   *
   * Unlike a payment checkout, this one REQUIRES a customer: a card saved
   * against nobody cannot be charged again later, which is the entire point.
   * So a client who has never paid gets a Stripe customer created here rather
   * than at their first payment.
   */
  async createSetupSession(request: SetupRequest): Promise<SetupSession> {
    const metadata = { client_id: request.clientId, kpve_autopay: "1" };

    const body = (customer: string): Record<string, Encodable> => ({
      mode: "setup",
      customer,
      // Cards only. The other methods Stripe would offer here either cannot be
      // charged off-session or need mandates this flow does not collect.
      payment_method_types: ["card"],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.clientId,
      metadata,
      setup_intent_data: { metadata },
    });

    const existing = request.customerId?.startsWith("cus_") ? request.customerId : null;
    let customerId = existing ?? (await this.createCustomer(request));
    let replacedCustomer = existing === null;
    let session: StripeCheckoutSession;

    try {
      session = await stripeRequest<StripeCheckoutSession>(
        "/checkout/sessions",
        body(customerId),
        this.secretKey,
      );
    } catch (error) {
      // Same recovery as createCheckout: a `cus_…` minted in test mode does not
      // exist once live keys go in, and it is indistinguishable by prefix.
      if (!existing || !isMissingCustomer(error)) throw error;

      console.warn(
        "[stripe] stored customer id was rejected — creating a new customer for this setup",
      );
      customerId = await this.createCustomer(request);
      replacedCustomer = true;
      session = await stripeRequest<StripeCheckoutSession>(
        "/checkout/sessions",
        body(customerId),
        this.secretKey,
      );
    }

    if (!session.url) {
      throw new PaymentProviderError("Stripe created the setup session but returned no URL.");
    }

    return {
      provider: "stripe",
      ref: session.id,
      url: session.url,
      customerId: session.customer ?? customerId,
      replacedCustomer,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    };
  }

  private async createCustomer(request: SetupRequest): Promise<string> {
    const customer = await stripeRequest<{ id: string }>(
      "/customers",
      {
        email: request.clientEmail,
        name: request.clientName,
        metadata: { client_id: request.clientId },
      },
      this.secretKey,
    );
    return customer.id;
  }

  /**
   * Session → SetupIntent → PaymentMethod. Three reads, because Stripe hands
   * the card back one indirection at a time and none of them can be skipped.
   *
   * Returns null rather than throwing when the session exists but saved
   * nothing: an abandoned setup is an ordinary outcome, not a fault.
   */
  async readSavedCard(setupRef: string): Promise<SavedCard | null> {
    const session = await stripeGet<{
      setup_intent: string | { id: string } | null;
      status: string | null;
    }>(`/checkout/sessions/${encodeURIComponent(setupRef)}`, this.secretKey);

    const setupIntentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : (session.setup_intent?.id ?? null);
    if (!setupIntentId) return null;

    const setupIntent = await stripeGet<{
      payment_method: string | { id: string } | null;
      status: string | null;
    }>(`/setup_intents/${encodeURIComponent(setupIntentId)}`, this.secretKey);

    const paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : (setupIntent.payment_method?.id ?? null);
    if (!paymentMethodId) return null;

    return this.readPaymentMethod(paymentMethodId);
  }

  async readPaymentMethod(paymentMethodId: string): Promise<SavedCard | null> {
    const method = await stripeGet<StripePaymentMethod>(
      `/payment_methods/${encodeURIComponent(paymentMethodId)}`,
      this.secretKey,
    );
    if (!method?.id) return null;

    return {
      paymentMethodId: method.id,
      brand: method.card?.brand ?? null,
      last4: method.card?.last4 ?? null,
      expMonth: method.card?.exp_month ?? null,
      expYear: method.card?.exp_year ?? null,
    };
  }

  /**
   * Charge a saved card with nobody watching.
   *
   * `off_session: true` tells Stripe there is no one there to answer a 3DS
   * prompt, which changes how the issuer is asked and what a failure means.
   * `confirm: true` makes it one round trip instead of two.
   *
   * A decline comes back as a 402 — an exception at the HTTP layer, but an
   * ordinary Tuesday for a business. It is caught here and returned as a
   * result, so a run of twenty invoices does not stop at the first bad card.
   */
  async chargeOffSession(charge: OffSessionCharge): Promise<ChargeResult> {
    const metadata = {
      // Never `invoice_id`: Stripe has its own invoices and a handler reading
      // the wrong key would settle the wrong document. Same rule as checkout.
      kpve_invoice_id: charge.invoiceId,
      client_id: charge.clientId,
      kpve_autopay: "1",
    };

    try {
      const intent = await stripeRequest<StripePaymentIntent>(
        "/payment_intents",
        {
          amount: charge.amountCents,
          currency: charge.currency.toLowerCase(),
          customer: charge.customerId,
          payment_method: charge.paymentMethodId,
          off_session: true,
          confirm: true,
          description: charge.description,
          metadata,
        },
        this.secretKey,
        { idempotencyKey: charge.idempotencyKey },
      );

      if (intent.status === "succeeded" || intent.status === "processing") {
        return {
          ok: true,
          paymentIntentId: intent.id,
          status: intent.status,
          amountCents: intent.amount ?? charge.amountCents,
          currency: (intent.currency ?? charge.currency).toUpperCase(),
          paidAt: new Date(),
        };
      }

      // Anything else needs the client back in front of a browser, which is
      // the one thing an off-session charge cannot arrange.
      return {
        ok: false,
        paymentIntentId: intent.id,
        code: intent.status === "requires_action" ? "authentication_required" : intent.status,
        message: "The card needs the account holder to confirm the payment.",
      };
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;

      const detail = error.detail as
        | { code?: string; decline_code?: string; payment_intent?: { id?: string } }
        | undefined;

      // `decline_code` is the specific reason ("insufficient_funds"); `code` is
      // the general one ("card_declined"). The specific one is more use to the
      // person who has to fix it.
      const code = detail?.decline_code ?? detail?.code ?? "provider_error";

      return {
        ok: false,
        paymentIntentId: detail?.payment_intent?.id ?? null,
        code,
        message: error.message,
      };
    }
  }
}

/** Stripe's "No such customer" — `resource_missing` on the `customer` param. */
function isMissingCustomer(error: unknown): boolean {
  if (!(error instanceof PaymentProviderError)) return false;
  const detail = error.detail as { code?: string; param?: string } | undefined;
  if (detail?.code === "resource_missing" && detail?.param === "customer") return true;
  // Older shapes don't always carry `param`; the message always names it.
  return /no such customer/i.test(error.message);
}

/* ---------------------------------------------------------------------------
   Webhook signature

   Stripe signs `${timestamp}.${rawBody}` with the endpoint secret. The check
   is mandatory and it is the ONLY thing standing between the internet and a
   route that marks invoices paid — the body itself is attacker-controlled
   until this returns true.
--------------------------------------------------------------------------- */

/** Reject anything older than this, so a captured request can't be replayed. */
const TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;

  // "t=1699999999,v1=abc…,v1=def…" — more than one v1 during a secret roll.
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value?.trim() ?? "";
    if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }

  if (!timestamp || signatures.length === 0) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(nowSeconds - sent) > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest();

  return signatures.some((candidate) => {
    let received: Buffer;
    try {
      received = Buffer.from(candidate, "hex");
    } catch {
      return false;
    }
    // timingSafeEqual throws on a length mismatch, which would itself leak.
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  });
}

/* ---------------------------------------------------------------------------
   Event → PaymentEvent

   Only the handful of fields we act on are read; everything else in a Stripe
   event is ignored on purpose. Amounts stay in the minor units Stripe already
   uses, which is the same unit this codebase stores.
--------------------------------------------------------------------------- */

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

export function parseStripeEvent(raw: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(raw) as StripeEvent;
    if (!parsed?.id || !parsed?.type || !parsed?.data?.object) return null;
    return parsed;
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Where our client_service_id can be hiding, in order of reliability. A
 * checkout session carries it directly; a renewal invoice carries it on the
 * subscription it was raised against.
 */
function extractClientServiceId(object: Record<string, unknown>): string | null {
  const direct = object.metadata as Record<string, unknown> | undefined;
  const fromMetadata = str(direct?.client_service_id);
  if (fromMetadata) return fromMetadata;

  const subscriptionDetails = object.subscription_details as
    | { metadata?: Record<string, unknown> }
    | undefined;
  const fromSubscription = str(subscriptionDetails?.metadata?.client_service_id);
  if (fromSubscription) return fromSubscription;

  const lines = object.lines as { data?: Array<Record<string, unknown>> } | undefined;
  for (const line of lines?.data ?? []) {
    const lineMetadata = line.metadata as Record<string, unknown> | undefined;
    const fromLine = str(lineMetadata?.client_service_id);
    if (fromLine) return fromLine;
  }

  return str(object.client_reference_id);
}

/**
 * Our invoice id, when the session was raised to pay a KPVE invoice rather than
 * to start a service. Only ever read from OUR key — `object.invoice` is Stripe's
 * own invoice, which is a different thing entirely.
 */
function extractInvoiceId(object: Record<string, unknown>): string | null {
  const direct = object.metadata as Record<string, unknown> | undefined;
  const fromMetadata = str(direct?.kpve_invoice_id);
  if (fromMetadata) return fromMetadata;

  const paymentIntent = object.payment_intent as
    | { metadata?: Record<string, unknown> }
    | undefined;
  return str(paymentIntent?.metadata?.kpve_invoice_id);
}

export type NormalizedStripeEvent =
  | { kind: "succeeded"; payment: PaymentEvent }
  | { kind: "failed"; clientServiceId: string; reason: string; providerRef: string }
  | { kind: "cancelled"; clientServiceId: string; providerRef: string }
  /* ---- AutoPay ---- */
  | { kind: "autopay_setup"; setupRef: string; customerId: string | null }
  | {
      kind: "autopay_failed";
      paymentIntentId: string;
      invoiceId: string | null;
      code: string;
      message: string;
    }
  | { kind: "card_updated"; paymentMethodId: string }
  | { kind: "card_detached"; paymentMethodId: string }
  | { kind: "ignored"; reason: string };

export function normalizeStripeEvent(event: StripeEvent): NormalizedStripeEvent {
  const object = event.data.object;
  const clientServiceId = extractClientServiceId(object);
  const invoiceId = extractInvoiceId(object);

  switch (event.type) {
    case "checkout.session.completed": {
      // A setup session saves a card and moves no money at all, so it is
      // answered before the payment checks below — `payment_status` on one of
      // these is "no_payment_required", which the paid check would discard.
      if (str(object.mode) === "setup") {
        return {
          kind: "autopay_setup",
          setupRef: str(object.id) ?? "",
          customerId: str(object.customer),
        };
      }

      // `complete` + `paid` is the only combination that means money moved;
      // async methods (BECS, bank debit) complete the session while still
      // unpaid and settle later via invoice.paid / payment_intent.succeeded.
      if (str(object.payment_status) !== "paid") {
        return { kind: "ignored", reason: "session completed but not paid" };
      }
      // An invoice checkout carries our invoice id and nothing else; a service
      // checkout carries the line. Neither means the event isn't ours to act on.
      if (!clientServiceId && !invoiceId) {
        return { kind: "ignored", reason: "no client_service_id or invoice id" };
      }

      return {
        kind: "succeeded",
        payment: {
          provider: "stripe",
          providerRef: event.id,
          clientServiceId,
          invoiceId,
          amountCents: num(object.amount_total) ?? 0,
          currency: (str(object.currency) ?? "aud").toUpperCase(),
          paidAt: new Date(event.created * 1000),
          subscriptionId: str(object.subscription),
          customerId: str(object.customer),
          description: "Checkout completed",
        },
      };
    }

    case "invoice.paid": {
      if (!clientServiceId) return { kind: "ignored", reason: "no client_service_id" };
      return {
        kind: "succeeded",
        payment: {
          provider: "stripe",
          providerRef: event.id,
          clientServiceId,
          amountCents: num(object.amount_paid) ?? 0,
          currency: (str(object.currency) ?? "aud").toUpperCase(),
          paidAt: new Date(event.created * 1000),
          subscriptionId: str(object.subscription),
          customerId: str(object.customer),
          description: str(object.number) ? `Invoice ${str(object.number)}` : "Invoice paid",
        },
      };
    }

    case "invoice.payment_failed": {
      if (!clientServiceId) return { kind: "ignored", reason: "no client_service_id" };
      return {
        kind: "failed",
        clientServiceId,
        providerRef: event.id,
        reason: "The card was declined or the payment failed.",
      };
    }

    /**
     * An AutoPay charge, coming back the long way round.
     *
     * The run already applied this payment when the charge returned — see
     * chargeOne() in lib/autopay/run.ts. This is the safety net for the case
     * where the run died between Stripe taking the money and us recording it.
     * `providerRef` is deliberately the PaymentIntent id and NOT `event.id`, so
     * that when both paths do run the unique index on payments.provider_ref
     * sees them as one payment rather than two.
     */
    case "payment_intent.succeeded": {
      if (!invoiceId) return { kind: "ignored", reason: "no invoice id" };

      // ONLY AutoPay's own charges. An ordinary Checkout payment fires this
      // event too — its PaymentIntent inherits `kpve_invoice_id` from
      // payment_intent_data — and checkout.session.completed has already
      // settled it under a different provider_ref (the event id). Acting on
      // both would write two ledger rows for one card payment, credit the
      // invoice twice, and show the client two charges in their own history.
      const metadata = object.metadata as Record<string, unknown> | undefined;
      if (str(metadata?.kpve_autopay) !== "1") {
        return { kind: "ignored", reason: "checkout payment, settled by its session event" };
      }

      return {
        kind: "succeeded",
        payment: {
          provider: "stripe",
          providerRef: str(object.id) ?? event.id,
          clientServiceId,
          invoiceId,
          amountCents: num(object.amount_received) ?? num(object.amount) ?? 0,
          currency: (str(object.currency) ?? "aud").toUpperCase(),
          paidAt: new Date(event.created * 1000),
          customerId: str(object.customer),
          description: "AutoPay",
        },
      };
    }

    case "payment_intent.payment_failed": {
      const paymentIntentId = str(object.id);
      if (!paymentIntentId) return { kind: "ignored", reason: "no payment intent id" };

      // Same reasoning as the branch above: a client abandoning a card on
      // Stripe's own checkout page is not an AutoPay failure and must not
      // count against their card.
      const failedMetadata = object.metadata as Record<string, unknown> | undefined;
      if (str(failedMetadata?.kpve_autopay) !== "1") {
        return { kind: "ignored", reason: "not an AutoPay charge" };
      }

      const error = object.last_payment_error as
        | { code?: string; decline_code?: string; message?: string }
        | undefined;

      return {
        kind: "autopay_failed",
        paymentIntentId,
        invoiceId,
        code: error?.decline_code ?? error?.code ?? "card_declined",
        message: error?.message ?? "The payment failed.",
      };
    }

    /**
     * The card networks reissue cards and Stripe follows them. Taking the new
     * digits keeps "Visa ending 4242" honest and keeps a perfectly good
     * arrangement from dying on an expiry date.
     */
    case "payment_method.automatically_updated": {
      const paymentMethodId = str(object.id);
      if (!paymentMethodId) return { kind: "ignored", reason: "no payment method id" };
      return { kind: "card_updated", paymentMethodId };
    }

    case "payment_method.detached": {
      const paymentMethodId = str(object.id);
      if (!paymentMethodId) return { kind: "ignored", reason: "no payment method id" };
      return { kind: "card_detached", paymentMethodId };
    }

    case "customer.subscription.deleted": {
      if (!clientServiceId) return { kind: "ignored", reason: "no client_service_id" };
      return { kind: "cancelled", clientServiceId, providerRef: event.id };
    }

    default:
      return { kind: "ignored", reason: `unhandled type ${event.type}` };
  }
}
