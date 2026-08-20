/* ---------------------------------------------------------------------------
   What the client agrees to when they turn AutoPay on.

   Card network rules and Stripe's own terms both require that before a card is
   stored for merchant-initiated charges the client is told four things —
   that we may charge it, WHEN, HOW MUCH, and HOW TO STOP — and that a record of
   the agreement is kept. `client_autopay.consent_text` stores the exact string
   below rather than a version number, so editing this copy next year cannot
   rewrite what somebody agreed to last year.

   Not "server-only": the portal renders it to the client and the DAL stores it,
   and those must be the same words. Two copies of consent text is how a
   business ends up unable to say what its customer actually agreed to.
--------------------------------------------------------------------------- */

export const AUTOPAY_CONSENT_VERSION = "2026-08-20";

/**
 * The clauses, in the order they are shown. Kept as a list rather than a
 * paragraph so the portal can render them as bullets and the stored record
 * still reads as prose when joined.
 */
export const AUTOPAY_CONSENT_POINTS = [
  "KPVE may charge this card automatically for invoices issued to your account.",
  "Each charge is for the amount outstanding on one invoice, on or after the date that invoice falls due.",
  "We email you before a charge and send a receipt after it.",
  "You can turn AutoPay off at any time from this page, and it stops immediately.",
  "If a charge fails, we email you a payment link instead and do not retry the card.",
] as const;

/** The exact record stored against the client, and shown above the button. */
export const AUTOPAY_CONSENT_TEXT = [
  `AutoPay authorisation (${AUTOPAY_CONSENT_VERSION}):`,
  ...AUTOPAY_CONSENT_POINTS,
].join(" ");
