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
  /**
   * Price of one FOR ONE CHARGE, so Stripe can itemise "4 × $11" instead of
   * "1 × $44". On a two-year line this is the two-year price of one domain —
   * `unit × term` — because that is what the client is charged each time.
   */
  unitAmountCents: number;
  quantity: number;
  currency: string;
  interval: BillingInterval;
  /**
   * Cycles per charge. Becomes Stripe's `interval_count`, turning an annual
   * subscription into a genuine every-two-years one.
   */
  termCount?: number;
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

/* ---------------------------------------------------------------------------
   AutoPay — saving a card, then charging it with nobody watching.

   Two operations the ordinary checkout does not need. They are on the same
   interface rather than a separate one because the simulator has to implement
   both: an AutoPay path that only exists against real Stripe is a path that
   only gets tested with real money.
--------------------------------------------------------------------------- */

/** Ask the provider for a page where the client can hand over a card. */
export type SetupRequest = {
  clientId: string;
  clientName: string;
  clientEmail: string;
  /** Existing `cus_…`, so the card lands on the customer we already have. */
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

/**
 * The same shape a checkout comes back as, and deliberately so — both are "send
 * them here, we'll hear about it on the webhook". `ref` is the setup session's
 * id, which is what the webhook echoes.
 */
export type SetupSession = CheckoutSession;

/** The stored card, as much of it as we are allowed to know. */
export type SavedCard = {
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export type OffSessionCharge = {
  invoiceId: string;
  clientId: string;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency: string;
  /** Shows on the client's statement and in the Stripe dashboard. */
  description: string;
  /**
   * `autopay_{invoice_id}_{attempt_no}` — see lib/autopay/select.ts. Sent to
   * the provider so a retried request returns the ORIGINAL charge rather than
   * making a second one. Never a timestamp, never random.
   */
  idempotencyKey: string;
};

/**
 * Deliberately a RESULT, not a thrown error.
 *
 * A declined card is not an exception — it is the expected outcome of a large
 * fraction of off-session charges, and the run has to carry on to the next
 * invoice. Only a broken request (bad key, provider down) throws.
 */
export type ChargeResult =
  | {
      ok: true;
      paymentIntentId: string;
      /** `processing` for methods that settle later; the webhook finishes it. */
      status: "succeeded" | "processing";
      amountCents: number;
      currency: string;
      paidAt: Date;
    }
  | {
      ok: false;
      /** Stripe still creates one for a decline, and it carries the reason. */
      paymentIntentId: string | null;
      /**
       * `authentication_required` when the bank wants 3DS and nobody is there
       * to give it, `card_declined`, `insufficient_funds`, `expired_card`…
       * Stored on the attempt row and used to decide whether a human is needed.
       */
      code: string;
      message: string;
    };

export interface PaymentProvider {
  readonly name: ProviderName;
  /** True when no real money can move — drives the "Simulated" badges in the UI. */
  readonly simulated: boolean;
  /** Mint a payment link for one billing line. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Mint a page that saves a card and charges nothing. */
  createSetupSession(request: SetupRequest): Promise<SetupSession>;
  /** Resolve a finished setup session into the card it saved. */
  readSavedCard(setupRef: string): Promise<SavedCard | null>;
  /** Re-read a card we already hold, after the network reissues it. */
  readPaymentMethod(paymentMethodId: string): Promise<SavedCard | null>;
  /** Take money from a saved card with the client nowhere near. */
  chargeOffSession(charge: OffSessionCharge): Promise<ChargeResult>;
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
