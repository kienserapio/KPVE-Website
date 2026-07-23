import "server-only";

import { MockPaymentProvider } from "./mock";
import { StripePaymentProvider } from "./stripe";
import type { PaymentProvider, ProviderName } from "./types";

export * from "./types";

/* ---------------------------------------------------------------------------
   Which provider is live.

   Stripe the moment STRIPE_SECRET_KEY exists; the simulator otherwise. That
   single rule is the whole "switch it on later" story:

     1. put STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the env
     2. register <NEXT_PUBLIC_APP_URL>/api/stripe/webhook in the Stripe dashboard

   No code change. PAYMENTS_PROVIDER=mock forces the simulator back on with the
   keys still in place, which is what you want for a demo on production data.
--------------------------------------------------------------------------- */

export function appUrl(): string {
  // Trailing slashes would produce "//pay/…" in every link we email out.
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function paymentProviderName(): ProviderName {
  if (process.env.PAYMENTS_PROVIDER === "mock") return "mock";
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "mock";
}

export function getPaymentProvider(): PaymentProvider {
  if (paymentProviderName() === "stripe") {
    return new StripePaymentProvider(process.env.STRIPE_SECRET_KEY!);
  }
  return new MockPaymentProvider(appUrl());
}

/** True while no real money can move. The UI says so wherever it matters. */
export function paymentsAreSimulated(): boolean {
  return paymentProviderName() === "mock";
}

/**
 * Whether live Stripe is *configured* but the webhook secret is missing —
 * links would work and payments would never be recorded, which is worse than
 * either end state, so the Revenue page calls this out.
 */
export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}
