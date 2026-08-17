import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { normalizeStripeEvent, parseStripeEvent, verifyStripeSignature } from "@/lib/payments/stripe";
import {
  applyPaymentFailed,
  applyPaymentSucceeded,
  applySubscriptionCancelled,
} from "@/lib/dal/payments";

/* ---------------------------------------------------------------------------
   Stripe webhook.

   This route is unauthenticated by necessity — Stripe has no session — so the
   signature check IS the authorization. Everything before verification treats
   the body as hostile input from the open internet; nothing is read out of it
   and no database write happens until the HMAC matches.

   Three rules it follows, all of them the reason webhooks go wrong elsewhere:

     1. The raw body is hashed, byte for byte. `await request.json()` would
        re-serialize and the signature would never match.
     2. Anything understood returns 200 — including events we deliberately
        ignore. A non-2xx makes Stripe retry the same event for days.
     3. Handlers are idempotent (unique index on payments.provider_ref), because
        Stripe delivers at-least-once and a retry must not bill twice.

   To switch this on: set STRIPE_WEBHOOK_SECRET and register
   <NEXT_PUBLIC_APP_URL>/api/stripe/webhook in the Stripe dashboard for
   checkout.session.completed, invoice.paid, invoice.payment_failed and
   customer.subscription.deleted. Locally:
     stripe listen --forward-to localhost:3000/api/stripe/webhook
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

// Stripe events are small; anything larger than this is not one of ours.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Loud, and not a 200: an unconfigured endpoint that silently swallowed
    // real payment events would be the worst possible failure here.
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set — event rejected");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(rawBody, signature, secret)) {
    console.warn("[stripe/webhook] rejected an event with a bad or missing signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = parseStripeEvent(rawBody);
  if (!event) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  try {
    const normalized = normalizeStripeEvent(event);

    switch (normalized.kind) {
      case "succeeded": {
        const result = await applyPaymentSucceeded(normalized.payment);
        if (result.clientId) revalidateFor(result.clientId);
        break;
      }
      case "failed": {
        const result = await applyPaymentFailed({
          clientServiceId: normalized.clientServiceId,
          providerRef: normalized.providerRef,
          provider: "stripe",
          reason: normalized.reason,
        });
        if (result.clientId) revalidateFor(result.clientId);
        break;
      }
      case "cancelled": {
        const result = await applySubscriptionCancelled({
          clientServiceId: normalized.clientServiceId,
          providerRef: normalized.providerRef,
        });
        if (result.clientId) revalidateFor(result.clientId);
        break;
      }
      case "ignored":
        // Logged, not retried: Stripe sends far more event types than we
        // subscribe to and every one of them deserves a 200.
        console.info(`[stripe/webhook] ignored ${event.type}: ${normalized.reason}`);
        break;
    }
  } catch (error) {
    // A 500 asks Stripe to retry, which is right for a transient database
    // failure — the handlers are idempotent, so a retry is safe.
    console.error("[stripe/webhook] handler failed", { type: event.type, error });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

function revalidateFor(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin/revenue");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin");
}
