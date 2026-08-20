import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type {
  ChargeResult,
  CheckoutSession,
  OffSessionCharge,
  PaymentProvider,
  SavedCard,
  SetupSession,
} from "./types";

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

  /* -------------------------------------------------------------------------
     AutoPay, simulated.

     The point of implementing it here rather than only against Stripe: every
     branch AutoPay can take — saved, declined, 3DS-refused, retried — has to be
     reachable without a Stripe key and without money. The fake payment method
     tokens below are what select which branch, and they are the simulator's
     answer to Stripe's `4000 0027 6000 3184`.
  ------------------------------------------------------------------------- */

  // Same reasoning as createCheckout: the simulated page reads everything it
  // needs from the ref, so there is nothing here to drift out of sync.
  async createSetupSession(): Promise<SetupSession> {
    const ref = `mock_seti_${randomBytes(16).toString("hex")}`;

    return {
      provider: "mock",
      ref,
      url: `${this.appUrl}/pay/setup/${ref}`,
      customerId: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  /**
   * Always null, and that is not a stub.
   *
   * Against Stripe this reads the card back out of a finished session, because
   * the card was entered on Stripe's page and the webhook only carries an id.
   * The simulated page is inside this app, so it records the chosen card itself
   * (see completeAutopaySetup in lib/dal/autopay-run.ts) — there is nothing left
   * here to fetch, and inventing a card would hide a real bug in that path.
   */
  async readSavedCard(): Promise<SavedCard | null> {
    return null;
  }

  /** Same reasoning: the simulator has no card updater to hear from. */
  async readPaymentMethod(): Promise<SavedCard | null> {
    return null;
  }

  async chargeOffSession(charge: OffSessionCharge): Promise<ChargeResult> {
    // Derived from the idempotency key, never random: charging twice with the
    // same key must produce the same id here too, or the simulator would pass
    // a double-charge test that Stripe would fail.
    const paymentIntentId = `mock_pi_${createHash("sha256")
      .update(charge.idempotencyKey)
      .digest("hex")
      .slice(0, 24)}`;

    const failure = MOCK_FAILURES[charge.paymentMethodId];
    if (failure) {
      return { ok: false, paymentIntentId, code: failure.code, message: failure.message };
    }

    return {
      ok: true,
      paymentIntentId,
      status: "succeeded",
      amountCents: charge.amountCents,
      currency: charge.currency.toUpperCase(),
      paidAt: new Date(),
    };
  }
}

/**
 * The simulator's test cards. Anything not listed here succeeds, so the happy
 * path needs no special token — `MOCK_CARDS` below is what the fake checkout
 * page offers.
 */
const MOCK_FAILURES: Record<string, { code: string; message: string }> = {
  mock_pm_auth: {
    code: "authentication_required",
    message: "The card needs the account holder to confirm the payment.",
  },
  mock_pm_declined: {
    code: "card_declined",
    message: "The card was declined.",
  },
  mock_pm_funds: {
    code: "insufficient_funds",
    message: "The card has insufficient funds.",
  },
};

/** What the simulated setup page offers, and what each one does when charged. */
export const MOCK_CARDS = [
  {
    id: "mock_pm_ok",
    label: "Visa ending 4242 — always works",
    brand: "visa",
    last4: "4242",
    behaviour: "Charges succeed.",
  },
  {
    id: "mock_pm_auth",
    label: "Visa ending 3184 — needs 3D Secure",
    brand: "visa",
    last4: "3184",
    behaviour: "Off-session charges fail with authentication_required.",
  },
  {
    id: "mock_pm_declined",
    label: "Visa ending 0002 — declined",
    brand: "visa",
    last4: "0002",
    behaviour: "Charges fail with card_declined.",
  },
  {
    id: "mock_pm_funds",
    label: "Mastercard ending 3178 — no funds",
    brand: "mastercard",
    last4: "3178",
    behaviour: "Charges fail with insufficient_funds.",
  },
] as const;

export type MockCardId = (typeof MOCK_CARDS)[number]["id"];
