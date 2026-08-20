/* ---------------------------------------------------------------------------
   Which invoices AutoPay charges on a given day.

   Deliberately NOT marked "server-only" and deliberately free of every import:
   no database, no Stripe, no clock. Everything it decides comes from its two
   arguments, which is the whole point — this is the one piece of AutoPay whose
   bugs move money, so it is the one piece that can be exhaustively tested
   without a database, a Stripe key or a calendar.

   The job (app/api/cron/autopay/route.ts) reads the rows, calls this, and does
   what it says. It makes no decisions of its own about what to charge.
--------------------------------------------------------------------------- */

/** Exactly what the run needs to know about one invoice. Nothing more. */
export type AutopayInvoiceRow = {
  invoiceId: string;
  /** "INV-2026-0009" — for the log and the email, never for a decision. */
  number: string;
  clientId: string;
  status: "draft" | "sent" | "paid" | "void";
  /** Plain date. Null is legal on an invoice and means "no terms agreed". */
  dueDate: Date | null;
  currency: string;
  totalCents: number;
  amountPaidCents: number;

  /* ---- from client_autopay ---- */
  autopayEnabled: boolean;
  paymentMethodId: string | null;
  /**
   * How many times in a row this client's card has been refused. Not a count
   * of all failures ever — a success resets it.
   */
  consecutiveFailures: number;

  /* ---- from autopay_attempts ---- */
  /**
   * True when an attempt for this invoice was started and has not resolved.
   * A charge whose response we never saw might still have taken the money, so
   * the next run must not start another one — it waits for the webhook or for
   * a human.
   */
  openAttempt: boolean;
  /**
   * Attempts already made against this invoice.
   *
   * On an unpaid invoice, any number above zero means a charge was tried and
   * did not settle it — a success would have marked it `paid`. That is a
   * refusal, not a counter: see the `previous_attempt_failed` skip.
   */
  attemptCount: number;

  /**
   * When a checkout link for this invoice was last minted, if one was.
   *
   * A client can be sitting on Stripe's payment page right now. Charging the
   * same invoice from here while that page is open is two real charges for one
   * debt, and neither side would know until the ledger was read by hand.
   */
  checkoutCreatedAt: Date | null;

  /**
   * When "we'll charge your card on the 30th" was sent for this invoice.
   *
   * Null blocks the charge outright. Nobody's card is charged without having
   * been told first: it is the difference between a service and a surprise, and
   * a surprise is what gets disputed. The job sends the notice in its own pass,
   * so an invoice issued already-overdue is noticed today and charged tomorrow.
   */
  noticeSentAt: Date | null;
};

/**
 * The ceilings. Every one of them is a "this has gone wrong" guard rather than
 * a business rule: a correct run never approaches any of them, and a run that
 * does is far more likely to be a bug than a good day.
 */
export type AutopayCaps = {
  maxInvoicesPerRun: number;
  maxCentsPerRun: number;
  maxInvoiceCents: number;
  /** Cards that have declined this many times in a row are left alone. */
  maxConsecutiveFailures: number;
};

/**
 * How long a notice has to have been out before the charge it warns about may
 * happen.
 *
 * Without this the gate is satisfied by an email sent in the same run, seconds
 * earlier — technically "we told you first", practically a surprise. A day is
 * the smallest gap that gives someone a real chance to read it and turn AutoPay
 * off, which is the only reason the notice exists.
 */
export const AUTOPAY_NOTICE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * How long a minted checkout link is treated as live. Stripe expires a Checkout
 * Session 24 hours after it is created, and until then the client can complete
 * it — so for that long, this invoice has another writer.
 */
export const CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Sized for one small agency: a normal day charges a handful of invoices for a
 * few hundred dollars. Staff can raise them in /admin/settings; they exist so
 * that the failure mode of a bad query is a stopped run and a loud log, not
 * four hundred charged clients.
 */
export const AUTOPAY_DEFAULT_CAPS: AutopayCaps = {
  maxInvoicesPerRun: 25,
  maxCentsPerRun: 500_000,
  maxInvoiceCents: 200_000,
  maxConsecutiveFailures: 3,
};

/** Why an invoice was not charged. Every one of these is logged, never silent. */
export type AutopaySkipReason =
  | "not_issued"
  | "already_settled"
  | "no_due_date"
  | "not_due_yet"
  | "nothing_owed"
  | "autopay_off"
  | "no_saved_card"
  | "too_many_failures"
  | "attempt_in_flight"
  | "previous_attempt_failed"
  | "checkout_in_flight"
  | "notice_not_sent"
  | "notice_too_recent"
  | "over_invoice_cap";

/**
 * Why an invoice that WAS eligible did not make this run. Separate from a skip
 * on purpose: a hold means "correct, but not today", and the next run will pick
 * it up. A skip means something about the invoice itself said no.
 */
export type AutopayHoldReason = "run_count_cap" | "run_amount_cap";

export type AutopayCharge = {
  invoiceId: string;
  clientId: string;
  number: string;
  /** The BALANCE, never the total — part-paid invoices are the reason. */
  amountCents: number;
  currency: string;
  attemptNo: number;
  idempotencyKey: string;
};

export type AutopayPlan = {
  charge: AutopayCharge[];
  skipped: { invoiceId: string; number: string; reason: AutopaySkipReason }[];
  held: { invoiceId: string; number: string; reason: AutopayHoldReason }[];
  /** Sum of what would be charged. Reported so a dry run is worth reading. */
  totalCents: number;
};

/**
 * The key sent to Stripe as `Idempotency-Key`, and stored on the attempt row.
 *
 * Deterministic in the two things that identify a charge attempt, so a retry
 * after a lost response returns Stripe's ORIGINAL PaymentIntent instead of
 * creating a second one. This is what stands between a crashed run and a
 * double charge; it must never include a timestamp or a random value.
 */
export function autopayIdempotencyKey(invoiceId: string, attemptNo: number): string {
  return `autopay_${invoiceId}_${attemptNo}`;
}

/** Midnight UTC of the day a Date falls on, so a due date can't drift by hours. */
function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Plan a run.
 *
 * Order matters twice over. Invoices are sorted oldest-due-first so that when a
 * cap bites it is the newest invoice that waits for tomorrow, not the one that
 * has been outstanding longest. And the caps are applied AFTER per-invoice
 * eligibility, so a skipped invoice never consumes a slot a payable one needed.
 */
export function planAutopayRun(
  rows: AutopayInvoiceRow[],
  options: { asOf: Date; caps?: Partial<AutopayCaps>; noticeGraceMs?: number },
): AutopayPlan {
  const caps: AutopayCaps = { ...AUTOPAY_DEFAULT_CAPS, ...options.caps };
  const asOfDay = startOfUtcDay(options.asOf);
  const noticeGraceMs = options.noticeGraceMs ?? AUTOPAY_NOTICE_GRACE_MS;

  const skipped: AutopayPlan["skipped"] = [];
  const held: AutopayPlan["held"] = [];
  // The sort key travels beside the charge, not inside it: AutopayCharge is
  // what gets handed to the provider, and it should carry nothing the provider
  // has no business seeing.
  const eligible: { charge: AutopayCharge; dueDay: number }[] = [];

  for (const row of rows) {
    const skip = (reason: AutopaySkipReason) =>
      skipped.push({ invoiceId: row.invoiceId, number: row.number, reason });

    // A draft was never issued and a void was withdrawn. Charging either would
    // be taking money against a document the client has never legitimately
    // been shown.
    if (row.status === "draft" || row.status === "void") {
      skip("not_issued");
      continue;
    }
    if (row.status === "paid") {
      skip("already_settled");
      continue;
    }

    const balanceCents = row.totalCents - row.amountPaidCents;
    if (balanceCents <= 0) {
      // Marked `sent` but fully covered by payments — the status write is
      // somewhere behind. Nothing owed is nothing to charge either way.
      skip("nothing_owed");
      continue;
    }

    if (!row.autopayEnabled) {
      skip("autopay_off");
      continue;
    }
    if (!row.paymentMethodId) {
      // Enabled but no card: a setup that was started and never finished.
      skip("no_saved_card");
      continue;
    }

    if (!row.dueDate) {
      // No due date is no agreed moment to take the money. Staff can add one.
      skip("no_due_date");
      continue;
    }
    const dueDay = startOfUtcDay(row.dueDate);
    if (dueDay > asOfDay) {
      skip("not_due_yet");
      continue;
    }

    if (row.consecutiveFailures >= caps.maxConsecutiveFailures) {
      // A card that has been refused three times running will be refused a
      // fourth, and repeated declines on a stored card look like card testing
      // to the network. Someone has to fix the card, not the retry loop.
      skip("too_many_failures");
      continue;
    }
    if (row.openAttempt) {
      skip("attempt_in_flight");
      continue;
    }
    if (row.attemptCount > 0) {
      // One attempt per invoice, ever. This is not caution, it is the promise
      // in lib/autopay/consent.ts and in the email the client was sent when the
      // charge failed: "we email you a payment link instead and do not retry
      // the card". Retrying would also mean charging on a notice that has
      // already been used, and — for a decline that later succeeds — racing the
      // client, who is by then paying through the link we gave them.
      skip("previous_attempt_failed");
      continue;
    }
    if (
      row.checkoutCreatedAt &&
      row.checkoutCreatedAt.getTime() + CHECKOUT_LIFETIME_MS > options.asOf.getTime()
    ) {
      skip("checkout_in_flight");
      continue;
    }
    if (!row.noticeSentAt) {
      skip("notice_not_sent");
      continue;
    }
    // Compared as whole days, not as a rolling 24 hours. The job runs on a
    // fixed schedule and stamps the notice a few seconds after its own `asOf`,
    // so an exact 24-hour window is missed by those few seconds and the charge
    // slips an extra day — or not — depending on scheduler jitter. A day
    // boundary is what the client understands anyway: they were told yesterday.
    const noticeDay = startOfUtcDay(row.noticeSentAt);
    const graceDays = Math.ceil(noticeGraceMs / (24 * 60 * 60 * 1000));
    if (noticeDay + graceDays * 24 * 60 * 60 * 1000 > asOfDay) {
      skip("notice_too_recent");
      continue;
    }

    if (balanceCents > caps.maxInvoiceCents) {
      // A single invoice larger than the ceiling is either the biggest job of
      // the year or a bug in the totals. Both deserve a human.
      skip("over_invoice_cap");
      continue;
    }

    const attemptNo = row.attemptCount + 1;
    eligible.push({
      dueDay,
      charge: {
        invoiceId: row.invoiceId,
        clientId: row.clientId,
        number: row.number,
        amountCents: balanceCents,
        currency: row.currency,
        attemptNo,
        idempotencyKey: autopayIdempotencyKey(row.invoiceId, attemptNo),
      },
    });
  }

  // Oldest due first; invoice number breaks ties so two runs over the same data
  // always produce the same plan.
  eligible.sort(
    (a, b) => a.dueDay - b.dueDay || a.charge.number.localeCompare(b.charge.number),
  );

  const charge: AutopayCharge[] = [];
  let totalCents = 0;

  for (const { charge: item } of eligible) {
    if (charge.length >= caps.maxInvoicesPerRun) {
      held.push({ invoiceId: item.invoiceId, number: item.number, reason: "run_count_cap" });
      continue;
    }
    // Currencies are summed together against one ceiling on purpose. This is a
    // safety limit, not an accounting total: mixing them can only ever make the
    // run stop sooner, which is the safe direction to be wrong in.
    if (totalCents + item.amountCents > caps.maxCentsPerRun) {
      held.push({ invoiceId: item.invoiceId, number: item.number, reason: "run_amount_cap" });
      continue;
    }

    charge.push(item);
    totalCents += item.amountCents;
  }

  return { charge, skipped, held, totalCents };
}
