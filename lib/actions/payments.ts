"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireSession } from "@/lib/dal/session";
import { clearCheckout, createCheckout, simulatePayment } from "@/lib/dal/payments";
import { clientServiceIdSchema } from "@/lib/validation";
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
    revalidatePath(`/pay/${ref}`);

    return { ok: true, error: null };
  } catch (error) {
    console.error("[simulatePaymentAction]", error);
    return fail(mapError(error));
  }
}
