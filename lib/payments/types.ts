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
  /**
   * What is being paid for. Exactly one of these is set, and whichever it is
   * round-trips through the provider's metadata so the webhook can find its way
   * home without trusting anything in the URL.
   *
   * A SERVICE checkout starts the ongoing arrangement — recurring intervals
   * become a real subscription over at the provider. An INVOICE checkout is
   * always a single charge for the invoice total, whatever the underlying lines
   * recur at: an invoice is a fixed amount due, and billing two years up front
   * then handing over a monthly subscription link would collect $11 against a
   * $1,056 document.
   */
  clientServiceId?: string | null;
  invoiceId?: string | null;
  clientId: string;
  label: string;
  /** The whole line's price — unitAmountCents × quantity. Kept for the mock. */
  amountCents: number;
  /** Price of one, so Stripe can itemise "4 × $11" instead of "1 × $44". */
  unitAmountCents: number;
  quantity: number;
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
  /**
   * True when the customer id we sent was rejected and the session was created
   * against a fresh customer instead. This is the test → live switch: a
   * `cus_…` minted in test mode does not exist in live mode, is indistinguishable
   * by prefix, and would fail every checkout for that client until someone
   * cleared it by hand. The caller overwrites the stored id when this is set.
   */
  replacedCustomer?: boolean;
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
  /** Which of ours this settles — the mirror of CheckoutRequest above. */
  clientServiceId?: string | null;
  invoiceId?: string | null;
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
