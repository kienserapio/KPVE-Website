import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { BillingInterval } from "@/lib/db/schema";
import {
  PaymentProviderError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
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
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
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

/* ---------------------------------------------------------------------------
   Provider
--------------------------------------------------------------------------- */

type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  expires_at?: number;
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
  | { kind: "ignored"; reason: string };

export function normalizeStripeEvent(event: StripeEvent): NormalizedStripeEvent {
  const object = event.data.object;
  const clientServiceId = extractClientServiceId(object);
  const invoiceId = extractInvoiceId(object);

  switch (event.type) {
    case "checkout.session.completed": {
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

    case "customer.subscription.deleted": {
      if (!clientServiceId) return { kind: "ignored", reason: "no client_service_id" };
      return { kind: "cancelled", clientServiceId, providerRef: event.id };
    }

    default:
      return { kind: "ignored", reason: `unhandled type ${event.type}` };
  }
}
