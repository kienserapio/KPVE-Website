import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { normalizeStripeEvent, parseStripeEvent, verifyStripeSignature } from "@/lib/payments/stripe";
import {
  applyPaymentFailed,
  applyPaymentSucceeded,
  applySubscriptionCancelled,
} from "@/lib/dal/payments";
import {
  completeAutopaySetup,
  detachSavedCard,
  findAttemptByPaymentIntent,
  findOpenAttemptByInvoice,
  refreshSavedCard,
  resolveAutopayAttemptFailed,
} from "@/lib/dal/autopay-run";
import { getPaymentProvider } from "@/lib/payments";

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
   customer.subscription.deleted — plus, for AutoPay,
   payment_intent.succeeded, payment_intent.payment_failed,
   payment_method.automatically_updated and payment_method.detached. Locally:
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
      /**
       * A client finished saving a card. This is the ONLY place AutoPay is
       * switched on: the button in the portal records their consent and sends
       * them to Stripe, and the arrangement only becomes real once a card comes
       * back — anything else would show them a promise with nothing behind it.
       */
      case "autopay_setup": {
        const provider = getPaymentProvider();
        const card = await provider.readSavedCard(normalized.setupRef);
        if (!card) {
          console.warn("[stripe/webhook] setup completed but saved no card", normalized.setupRef);
          break;
        }

        const applied = await completeAutopaySetup({
          setupRef: normalized.setupRef,
          provider: provider.name,
          paymentMethodId: card.paymentMethodId,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          customerId: normalized.customerId,
        });
        if (applied?.clientId) revalidateFor(applied.clientId);
        break;
      }

      /**
       * A charge the run already knows about — it is told synchronously when it
       * makes the charge. This is the case where Stripe declines asynchronously
       * (or the run died before it heard back), so it only acts on an attempt
       * still sitting in `started`.
       */
      case "autopay_failed": {
        // By intent first, then by invoice. The second is not a nicety: an
        // attempt is written before the charge is made, so a run that died in
        // between never recorded which PaymentIntent it got — and that is
        // precisely the run this branch is here to clean up after.
        const attempt =
          (await findAttemptByPaymentIntent(normalized.paymentIntentId)) ??
          (normalized.invoiceId ? await findOpenAttemptByInvoice(normalized.invoiceId) : null);

        if (!attempt || attempt.status !== "started") {
          console.info("[stripe/webhook] payment_intent.payment_failed with no open attempt");
          break;
        }

        await resolveAutopayAttemptFailed({
          attemptId: attempt.attemptId,
          clientId: attempt.clientId,
          invoiceId: attempt.invoiceId,
          paymentIntentId: normalized.paymentIntentId,
          idempotencyKey: attempt.idempotencyKey,
          amountCents: attempt.amountCents,
          currency: attempt.currency,
          code: normalized.code,
          message: normalized.message,
          provider: "stripe",
        });
        revalidateFor(attempt.clientId);
        break;
      }

      case "card_updated": {
        const card = await getPaymentProvider().readPaymentMethod(normalized.paymentMethodId);
        // Only the digits change. If the read fails we keep what we have rather
        // than blanking a card that still works.
        if (card) {
          await refreshSavedCard({
            paymentMethodId: normalized.paymentMethodId,
            brand: card.brand,
            last4: card.last4,
            expMonth: card.expMonth,
            expYear: card.expYear,
          });
        }
        break;
      }

      case "card_detached":
        await detachSavedCard(normalized.paymentMethodId);
        break;

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
