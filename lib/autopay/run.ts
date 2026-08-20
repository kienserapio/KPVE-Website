import "server-only";

import { formatMoney } from "@/lib/billing";
import { logActivity } from "@/lib/dal/activity";
import { applyPaymentSucceeded } from "@/lib/dal/payments";
import { getOrgSettings } from "@/lib/dal/settings";
import {
  beginAutopayAttempt,
  listAutopayNoticeDue,
  loadAutopayCandidates,
  markAutopayNoticeSent,
  resolveAutopayAttemptFailed,
  resolveAutopayAttemptSucceeded,
  suspendAutopayAfterFailures,
  type AutopayCandidate,
} from "@/lib/dal/autopay-run";
import { sendMail } from "@/lib/email";
import {
  autopayFailedEmail,
  autopayNoticeEmail,
  autopayReceiptEmail,
} from "@/lib/email/templates";
import { getPaymentProvider } from "@/lib/payments";
import { AUTOPAY_DEFAULT_CAPS, planAutopayRun } from "./select";

/* ---------------------------------------------------------------------------
   The nightly run.

   Two passes, in this order and never the other way round:

     1. NOTICES — "we'll charge your card on the 30th", for invoices coming due.
     2. CHARGES  — for invoices that are due AND were noticed on an earlier run.

   The ordering is what makes the promise in lib/autopay/consent.ts true. An
   invoice noticed today is charged tomorrow at the earliest, so there is always
   a day between the warning and the money — including for an invoice that was
   issued already overdue.

   Nothing in here decides what to charge. planAutopayRun() does that, from
   rows, with no clock and no database, and this file does what it is told.
--------------------------------------------------------------------------- */

export type AutopayRunSummary = {
  asOf: string;
  dryRun: boolean;
  provider: string;
  /** False when the kill switch in /admin/settings is off. Nothing else ran. */
  enabled: boolean;
  notices: { sent: number; failed: number };
  charges: {
    planned: number;
    attempted: number;
    succeeded: number;
    failed: number;
    totalCents: number;
  };
  /** Clients whose AutoPay was switched off after too many declines. */
  suspended: number;
  /** Counts by reason — every invoice the plan touched is in one of these. */
  skipped: Record<string, number>;
  held: Record<string, number>;
  /** Anything that threw. One entry per invoice, never a stack trace. */
  errors: string[];
};

export async function runAutopay(options: {
  asOf: Date;
  dryRun: boolean;
}): Promise<AutopayRunSummary> {
  const provider = getPaymentProvider();
  const settings = await getOrgSettings();

  const summary: AutopayRunSummary = {
    asOf: options.asOf.toISOString().slice(0, 10),
    dryRun: options.dryRun,
    provider: provider.name,
    enabled: settings.autopayEnabled,
    notices: { sent: 0, failed: 0 },
    charges: { planned: 0, attempted: 0, succeeded: 0, failed: 0, totalCents: 0 },
    suspended: 0,
    skipped: {},
    held: {},
    errors: [],
  };

  // The kill switch. Checked before anything is read, so turning it off in the
  // CRM stops the next run dead rather than stopping it halfway.
  if (!settings.autopayEnabled) return summary;

  await sendNotices(options, settings.autopayNoticeDays, summary);
  await chargeDue(options, settings, summary);

  await logActivity({
    actorType: "system",
    entityType: "autopay",
    action: options.dryRun ? "autopay.run_dry" : "autopay.run",
    metadata: { ...summary },
  });

  return summary;
}

/* ---------------------------------------------------------------------------
   Pass one — the warning
--------------------------------------------------------------------------- */

async function sendNotices(
  options: { asOf: Date; dryRun: boolean },
  noticeDays: number,
  summary: AutopayRunSummary,
): Promise<void> {
  const due = await listAutopayNoticeDue(options.asOf, noticeDays);

  for (const invoice of due) {
    if (options.dryRun) {
      summary.notices.sent += 1;
      continue;
    }

    if (!invoice.email) {
      // No address to warn them at, so they can never be charged either. Loud,
      // because it is a data problem staff can fix in one click.
      summary.notices.failed += 1;
      summary.errors.push(`${invoice.number}: no email address to send the notice to`);
      continue;
    }

    const { subject, text, html } = autopayNoticeEmail({
      clientName: invoice.clientName,
      number: invoice.number,
      amount: formatMoney(invoice.balanceCents, invoice.currency),
      dueDate: invoice.dueDate
        ? new Date(`${invoice.dueDate}T00:00:00.000Z`)
        : options.asOf,
      cardBrand: invoice.cardBrand,
      cardLast4: invoice.cardLast4,
    });

    const result = await sendMail({ to: invoice.email, subject, text, html });

    // Stamped ONLY on a successful send. The stamp is what unlocks the charge,
    // so a notice that bounced must leave the invoice locked — being unable to
    // warn someone is a reason not to charge them, not a formality to record.
    if (!result.sent) {
      summary.notices.failed += 1;
      summary.errors.push(`${invoice.number}: notice not sent (${result.reason})`);
      continue;
    }

    await markAutopayNoticeSent(invoice.invoiceId);
    await logActivity({
      actorType: "system",
      entityType: "invoice",
      entityId: invoice.invoiceId,
      action: "autopay.notice_sent",
      metadata: { number: invoice.number, amountCents: invoice.balanceCents },
    });
    summary.notices.sent += 1;
  }
}

/* ---------------------------------------------------------------------------
   Pass two — the money
--------------------------------------------------------------------------- */

async function chargeDue(
  options: { asOf: Date; dryRun: boolean },
  settings: {
    autopayMaxInvoicesPerRun: number;
    autopayMaxCentsPerRun: number;
    autopayMaxInvoiceCents: number;
  },
  summary: AutopayRunSummary,
): Promise<void> {
  const provider = getPaymentProvider();
  const candidates = await loadAutopayCandidates(options.asOf);

  const plan = planAutopayRun(candidates, {
    asOf: options.asOf,
    caps: {
      maxInvoicesPerRun: settings.autopayMaxInvoicesPerRun,
      maxCentsPerRun: settings.autopayMaxCentsPerRun,
      maxInvoiceCents: settings.autopayMaxInvoiceCents,
      maxConsecutiveFailures: AUTOPAY_DEFAULT_CAPS.maxConsecutiveFailures,
    },
  });

  for (const item of plan.skipped) summary.skipped[item.reason] = (summary.skipped[item.reason] ?? 0) + 1;
  for (const item of plan.held) summary.held[item.reason] = (summary.held[item.reason] ?? 0) + 1;
  summary.charges.planned = plan.charge.length;

  const byInvoice = new Map(candidates.map((row) => [row.invoiceId, row]));

  /**
   * Failures counted within this run, per client.
   *
   * The count on the row is what it was when the candidates were read, so a
   * client with three due invoices and a dead card would otherwise look like
   * one failure three times over and never trip the suspension.
   */
  const failuresThisRun = new Map<string, number>();

  for (const charge of plan.charge) {
    const candidate = byInvoice.get(charge.invoiceId);
    if (!candidate) continue;

    if (options.dryRun) {
      summary.charges.totalCents += charge.amountCents;
      continue;
    }

    try {
      await chargeOne(charge, candidate, provider, failuresThisRun, summary);
    } catch (error) {
      // The attempt row is left `started` on purpose. A charge that threw may
      // still have taken the money, and the next run must refuse the invoice
      // rather than guess — see beginAutopayAttempt.
      console.error("[autopay] charge threw", charge.number, error);
      summary.errors.push(`${charge.number}: ${describeError(error)}`);
    }
  }
}

async function chargeOne(
  charge: {
    invoiceId: string;
    clientId: string;
    number: string;
    amountCents: number;
    currency: string;
    attemptNo: number;
    idempotencyKey: string;
  },
  candidate: AutopayCandidate,
  provider: ReturnType<typeof getPaymentProvider>,
  failuresThisRun: Map<string, number>,
  summary: AutopayRunSummary,
): Promise<void> {
  if (!candidate.paymentMethodId) return;

  // A client can have AutoPay on and no Stripe customer only if the customer id
  // was cleared behind us. Charging is impossible; say so rather than throwing
  // a provider error nobody can read.
  if (!candidate.customerId && !provider.simulated) {
    summary.errors.push(`${charge.number}: no billing customer to charge`);
    return;
  }

  const claim = await beginAutopayAttempt({
    invoiceId: charge.invoiceId,
    clientId: charge.clientId,
    attemptNo: charge.attemptNo,
    idempotencyKey: charge.idempotencyKey,
    amountCents: charge.amountCents,
    currency: charge.currency,
  });
  // Another run holds this attempt. Not an error — the guard working.
  if (!claim) return;

  summary.charges.attempted += 1;

  const result = await provider.chargeOffSession({
    invoiceId: charge.invoiceId,
    clientId: charge.clientId,
    customerId: candidate.customerId ?? "",
    paymentMethodId: candidate.paymentMethodId,
    amountCents: charge.amountCents,
    currency: charge.currency,
    description: `Invoice ${charge.number}`,
    idempotencyKey: charge.idempotencyKey,
  });

  // Money that has not landed yet is not money. Leaving the attempt `started`
  // blocks the invoice until the webhook says which way it went — settling it
  // now would mark the invoice paid, and a later failure could never unmark it
  // because the attempt would no longer be open.
  if (result.ok && result.status === "processing") {
    summary.errors.push(`${charge.number}: still processing, waiting on the webhook`);
    return;
  }

  if (result.ok) {
    // Settled through the SAME function a "Pay now" checkout settles through,
    // so an AutoPay payment and a manual one produce the same ledger row, the
    // same invoice status and the same rolled bill date. The PaymentIntent id
    // is the ref rather than a webhook event id, so when Stripe's webhook
    // arrives with the same intent it dedupes against this instead of writing
    // a second payment.
    await applyPaymentSucceeded({
      provider: provider.name,
      providerRef: result.paymentIntentId,
      invoiceId: charge.invoiceId,
      amountCents: result.amountCents,
      currency: result.currency,
      paidAt: result.paidAt,
      customerId: candidate.customerId,
      description: "AutoPay",
    });

    await resolveAutopayAttemptSucceeded({
      attemptId: claim.attemptId,
      clientId: charge.clientId,
      paymentIntentId: result.paymentIntentId,
    });

    summary.charges.succeeded += 1;
    summary.charges.totalCents += result.amountCents;

    if (candidate.email) {
      const mail = autopayReceiptEmail({
        clientName: candidate.clientName,
        number: charge.number,
        amount: formatMoney(result.amountCents, result.currency),
        paidAt: result.paidAt,
        cardBrand: candidate.cardBrand,
        cardLast4: candidate.cardLast4,
      });
      await sendMail({ to: candidate.email, ...mail });
    }
    return;
  }

  await resolveAutopayAttemptFailed({
    attemptId: claim.attemptId,
    clientId: charge.clientId,
    invoiceId: charge.invoiceId,
    paymentIntentId: result.paymentIntentId,
    idempotencyKey: charge.idempotencyKey,
    amountCents: charge.amountCents,
    currency: charge.currency,
    code: result.code,
    message: result.message,
    provider: provider.name,
  });

  summary.charges.failed += 1;

  const failures =
    candidate.consecutiveFailures + (failuresThisRun.get(charge.clientId) ?? 0) + 1;
  failuresThisRun.set(charge.clientId, (failuresThisRun.get(charge.clientId) ?? 0) + 1);

  const suspended = failures >= AUTOPAY_DEFAULT_CAPS.maxConsecutiveFailures;
  if (suspended) {
    await suspendAutopayAfterFailures({ clientId: charge.clientId, code: result.code });
    summary.suspended += 1;
  }

  if (candidate.email) {
    const mail = autopayFailedEmail({
      clientName: candidate.clientName,
      number: charge.number,
      amount: formatMoney(charge.amountCents, charge.currency),
      code: result.code,
      cardBrand: candidate.cardBrand,
      cardLast4: candidate.cardLast4,
      suspended,
    });
    await sendMail({ to: candidate.email, ...mail });
  }
}

/** Never a stack trace: this ends up in a JSON response and in the log. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown error";
}
