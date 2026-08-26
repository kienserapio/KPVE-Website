"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/dal/session";
import {
  clearCheckout,
  createCheckout,
  createInvoiceCheckout,
  getPaymentLinkRecipient,
  simulatePayment,
} from "@/lib/dal/payments";
import { logActivity } from "@/lib/dal/activity";
import { sendMail } from "@/lib/email";
import { paymentLinkEmail } from "@/lib/email/templates";
import type { EmailFlowState } from "@/lib/email/flow";
import { formatRate, formatTerm, INTERVAL_NOUN } from "@/lib/billing";
import type { BillingInterval } from "@/lib/db/schema";
import { getInvoiceByToken } from "@/lib/dal/invoices";
import { clientServiceIdSchema, payInvoiceSchema } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export type PaymentActionState = {
  ok: boolean;
  error: string | null;
  /** The link that was just minted, so the UI can show and copy it. */
  url?: string | null;
  simulated?: boolean;
};

const fail = (error: string): PaymentActionState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Please try again.";

  switch (error.message) {
    case "UNAUTHORIZED":
      return "Your session expired. Please sign in again.";
    case "NOT_FOUND":
      return "That billing line no longer exists.";
    case "ZERO_AMOUNT":
      return "Set an amount above zero before sending a payment link.";
    case "LINE_CANCELLED":
      return "This line is cancelled. Reactivate it before asking for payment.";
    case "ALREADY_PAID":
      return "This link has already been paid.";
    case "NOT_SIMULATED":
      return "This link is a real payment link and can't be simulated.";
    case "NOT_PAYABLE":
      return "This invoice can't be paid online right now. Please get in touch.";
    default:
      // Provider errors carry a message worth showing — "Your card was
      // declined" is more useful than "something went wrong".
      return error.name === "PaymentProviderError"
        ? error.message
        : "Something went wrong. Please try again.";
  }
}

/* ---------------------------------------------------------------------------
   Staff actions
--------------------------------------------------------------------------- */

export async function createPaymentLinkAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const parsed = clientServiceIdSchema.safeParse({
    clientServiceId: formData.get("clientServiceId"),
  });
  if (!parsed.success) return fail("That billing line couldn't be found.");

  const clientId = String(formData.get("clientId") ?? "");

  try {
    await requireSession();
    const checkout = await createCheckout(parsed.data.clientServiceId);

    if (clientId) revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");
    revalidatePath("/admin");
    revalidatePath("/admin/revenue");

    return { ok: true, error: null, url: checkout.url, simulated: checkout.simulated };
  } catch (error) {
    console.error("[createPaymentLinkAction]", error);
    return fail(mapError(error));
  }
}

export async function revokePaymentLinkAction(formData: FormData): Promise<void> {
  const clientServiceId = String(formData.get("clientServiceId") ?? "");
  if (!clientServiceId) return;

  try {
    await requireSession();
    const { clientId } = await clearCheckout(clientServiceId);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[revokePaymentLinkAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   "Pay now" on the client's own copy of an invoice.

   No session, by necessity: the client has no admin login, and the 32-hex token
   in their URL is the credential — the same trust model as /pay/[ref]. The
   token is all this accepts; the invoice id is never taken from the request, so
   holding one link can only ever pay the invoice it belongs to.

   The Checkout Session is minted HERE, on the click, rather than when the
   invoice was sent. A Stripe session expires in 24 hours and an invoice does
   not: minting at send time would email a button that is dead by the time
   anybody presses it.
--------------------------------------------------------------------------- */

export async function payInvoiceAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const parsed = payInvoiceSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return fail("This payment link is no longer valid.");

  // Minting a session is a call to Stripe, so it is worth rate limiting even
  // though the token is unguessable.
  const ip = getClientIp(await headers());
  const limit = rateLimit(`invoice-pay:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return fail("Too many attempts. Please try again in a little while.");

  let url: string;
  try {
    // getInvoiceByToken already validates the token shape and refuses drafts.
    const invoice = await getInvoiceByToken(parsed.data.token);
    if (!invoice) return fail("This payment link is no longer valid.");
    if (!invoice.payable) {
      return fail(
        invoice.status === "paid"
          ? "This invoice is already paid — nothing to do."
          : "This invoice can't be paid online right now. Please get in touch.",
      );
    }

    ({ url } = await createInvoiceCheckout(invoice.id));
  } catch (error) {
    console.error("[payInvoiceAction]", error);
    return fail(mapError(error));
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a successful checkout into "something went wrong".
  redirect(url);
}

/* ---------------------------------------------------------------------------
   The simulated checkout — called from /pay/[ref], which has no session.

   Authorization is the unguessable ref, exactly as it is for a real Stripe
   Checkout URL. The DAL refuses anything that isn't a simulated ref, so this
   can never settle a real invoice, and the rate limit keeps the endpoint from
   being usable to enumerate refs.
--------------------------------------------------------------------------- */

export async function simulatePaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const ref = String(formData.get("ref") ?? "");
  if (!ref) return fail("This payment link is no longer valid.");

  const ip = getClientIp(await headers());
  const limit = rateLimit(`pay:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return fail("Too many attempts. Please try again later.");

  try {
    const result = await simulatePayment(ref);
    if (!result.applied && !result.duplicate) {
      return fail("This payment link is no longer valid.");
    }

    if (result.clientId) revalidatePath(`/admin/clients/${result.clientId}`);
    revalidatePath("/admin");
    revalidatePath("/admin/revenue");
    revalidatePath("/admin/invoices");
    revalidatePath(`/pay/${ref}`);

    return { ok: true, error: null };
  } catch (error) {
    console.error("[simulatePaymentAction]", error);
    return fail(mapError(error));
  }
}

/* ---------------------------------------------------------------------------
   Emailing a payment link — preview, then send.

   Two actions rather than one because this is the only mail in the app a staff
   member is asked to approve before it leaves. A payment link is a request for
   money with a recurrence attached, so "what exactly is the client about to
   read?" is a fair question to be able to answer without sending it to yourself
   first. The preview renders the real template from the real row; pressing Send
   builds it again the same way, so what was approved is what goes.

   The line is read back from the database in both, never taken from the form.
   The browser knows the URL and the amount, but a request for money decides
   where it goes and what it says server-side or not at all.
--------------------------------------------------------------------------- */

/** The shared two-step shape — see lib/email/flow.ts. */
export type PaymentEmailState = EmailFlowState;

/** The rate said in words. "$44/yr" is fine on screen; an inbox deserves more. */
function recurrenceSentence(interval: BillingInterval, termCount: number): string {
  if (interval === "one_off") return "A one-off charge — it won't repeat.";
  const term = formatTerm(interval, termCount);
  return termCount > 1
    ? `Charged every ${term}, until you tell us to stop.`
    : `Charged every ${INTERVAL_NOUN[interval]}, until you tell us to stop.`;
}

/** Build the mail for a line. Shared, so preview and send cannot disagree. */
async function composePaymentLinkEmail(clientServiceId: string) {
  const line = await getPaymentLinkRecipient(clientServiceId);
  const mail = paymentLinkEmail({
    clientName: line.clientName,
    label: line.label,
    rate: formatRate(line.amountCents, line.currency, line.interval, line.termCount),
    recurrence: recurrenceSentence(line.interval, line.termCount),
    url: line.url,
    simulated: line.simulated,
  });
  return { line, mail };
}

function mapPaymentEmailError(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case "NO_LINK":
        return "There's no payment link on this line yet. Create one first.";
      case "NO_EMAIL":
        return "This client has no email address. Add one first.";
    }
  }
  return mapError(error);
}

export async function previewPaymentLinkEmailAction(
  _prev: PaymentEmailState,
  formData: FormData,
): Promise<PaymentEmailState> {
  const parsed = clientServiceIdSchema.safeParse({
    clientServiceId: formData.get("clientServiceId"),
  });
  if (!parsed.success) return fail("That billing line couldn't be found.");

  try {
    await requireSession();
    const { line, mail } = await composePaymentLinkEmail(parsed.data.clientServiceId);
    return {
      ok: true,
      error: null,
      preview: { to: line.clientEmail, subject: mail.subject, html: mail.html },
    };
  } catch (error) {
    console.error("[previewPaymentLinkEmailAction]", error);
    return fail(mapPaymentEmailError(error));
  }
}

export async function emailPaymentLinkAction(
  _prev: PaymentEmailState,
  formData: FormData,
): Promise<PaymentEmailState> {
  const parsed = clientServiceIdSchema.safeParse({
    clientServiceId: formData.get("clientServiceId"),
  });
  if (!parsed.success) return fail("That billing line couldn't be found.");

  try {
    await requireSession();
    const { line, mail } = await composePaymentLinkEmail(parsed.data.clientServiceId);

    const result = await sendMail({
      to: line.clientEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    if (!result.sent) {
      return {
        ok: false,
        error: null,
        delivery: { sent: false, to: line.clientEmail, reason: result.reason },
      };
    }

    await logActivity({
      actorType: "staff",
      entityType: "client",
      entityId: line.clientId,
      action: "payment.link_emailed",
      metadata: { clientServiceId: parsed.data.clientServiceId, to: line.clientEmail },
    });

    revalidatePath(`/admin/clients/${line.clientId}`);
    return { ok: true, error: null, delivery: { sent: true, to: line.clientEmail } };
  } catch (error) {
    console.error("[emailPaymentLinkAction]", error);
    return fail(mapPaymentEmailError(error));
  }
}
