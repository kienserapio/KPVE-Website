import "server-only";

import { randomBytes } from "node:crypto";

import type { CheckoutSession, PaymentProvider } from "./types";

/* ---------------------------------------------------------------------------
   The simulated provider — what runs until a real Stripe account exists.

   It mints a link to /pay/[ref], a page inside this app that looks like a
   checkout and has a "Pay now" button. Pressing it applies the exact same
   PaymentEvent the Stripe webhook would, so the whole downstream path (service
   goes active, bill date rolls, payment row written, activity logged) is real
   and gets exercised now rather than on the day the keys land.

   The ref is 32 random hex characters because the link is the only thing
   guarding that page: it goes to a client by email, is not behind the admin
   session, and must not be guessable from another client's link.
--------------------------------------------------------------------------- */

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly simulated = true;

  constructor(private readonly appUrl: string) {}

  // Takes no argument on purpose: a simulated checkout needs no amount,
  // customer or return URL. /pay/[ref] reads all of that off the billing line
  // the ref points at, so there is nothing here that could drift out of sync
  // with what the client is actually being charged.
  async createCheckout(): Promise<CheckoutSession> {
    const ref = `mock_cs_${randomBytes(16).toString("hex")}`;

    // Mirrors Stripe's 24-hour Checkout Session expiry so the UI copy about
    // links going stale is true in both modes.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      provider: "mock",
      ref,
      url: `${this.appUrl}/pay/${ref}`,
      // Deliberately no invented customer id. A fake `cus_…` written onto the
      // client now would be sent to Stripe as an existing customer on the first
      // real checkout after the switch, and Stripe would reject it.
      customerId: null,
      expiresAt,
    };
  }
}
