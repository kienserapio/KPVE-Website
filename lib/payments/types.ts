import type { BillingInterval } from "@/lib/db/schema";

/* ---------------------------------------------------------------------------
   The payment provider contract.

   Two implementations sit behind it: `mock` (an in-app simulated checkout, the
   default with no keys set) and `stripe` (real). Everything above this line —
   the DAL, the actions, the UI, the webhook — is written against the interface
   only, so switching is a matter of adding STRIPE_SECRET_KEY to the env and
   nothing else. See lib/payments/index.ts for how the choice is made.
--------------------------------------------------------------------------- */

export type ProviderName = "mock" | "stripe";

export type CheckoutRequest = {
  /** Our id for the billing line. Round-trips through the provider's metadata. */
  clientServiceId: string;
  clientId: string;
  label: string;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  clientName: string;
  clientEmail: string;
  /** Existing provider customer id, so a repeat client isn't duplicated there. */
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  provider: ProviderName;
  /** The provider's id for this checkout — what its webhook will echo back. */
  ref: string;
  /** Where to send the client. */
  url: string;
  /** Set when the provider created or matched a customer record. */
  customerId?: string | null;
  /** When the link stops working, if the provider says. */
  expiresAt?: Date | null;
};

export interface PaymentProvider {
  readonly name: ProviderName;
  /** True when no real money can move — drives the "Simulated" badges in the UI. */
  readonly simulated: boolean;
  /** Mint a payment link for one billing line. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
}

/**
 * A payment that has cleared, normalized out of whatever shape the provider
 * sent. This is the only thing lib/dal/payments.ts knows how to apply, so the
 * simulator and a real Stripe webhook take the identical code path — the one
 * that flips the service to active, rolls the bill date and writes the ledger.
 */
export type PaymentEvent = {
  provider: ProviderName;
  /** Unique per event at the provider. The idempotency key for the whole flow. */
  providerRef: string;
  clientServiceId: string;
  amountCents: number;
  currency: string;
  paidAt: Date;
  /** Present once a recurring line became a real subscription over there. */
  subscriptionId?: string | null;
  customerId?: string | null;
  description?: string | null;
};

/** Thrown for provider-side failures the UI should report rather than swallow. */
export class PaymentProviderError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
