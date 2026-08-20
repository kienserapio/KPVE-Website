"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { disablePortalAutopay, startPortalAutopaySetup } from "@/lib/dal/autopay";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

/* ---------------------------------------------------------------------------
   The client turning AutoPay on and off.

   This is the second thing a client can do in the portal, after paying an
   invoice — and the first that changes anything standing. The portal is
   otherwise a read-only view of the CRM (see lib/actions/portal-billing.ts),
   and that line is held here too: nothing in this file writes to `clients`,
   `invoices` or `client_services`. It records a permission about a card.

   Turning it ON is deliberately two round trips: this action only records the
   consent and mints a Stripe setup session. The arrangement becomes real when a
   card comes back, which happens on the webhook.
--------------------------------------------------------------------------- */

export type PortalAutopayState = { error: string | null };

const fail = (error: string): PortalAutopayState => ({ error });

/**
 * Its own limiter, keyed by signed-in user rather than IP — the same reasoning
 * as the Pay now action: one office behind one address must not lock itself
 * out. Setting up a card is a handful of presses at most.
 */
const limiter = createRateLimiter();
const SETUP_LIMIT = 10;
const SETUP_WINDOW_MS = 60 * 60 * 1000;

export async function startAutopayAction(
  _prev: PortalAutopayState,
  formData: FormData,
): Promise<PortalAutopayState> {
  let url: string;

  try {
    // The box is the consent. Without it there is nothing to record, and an
    // AutoPay arrangement with no recorded agreement is one we cannot defend
    // if the client ever disputes a charge.
    if (formData.get("consent") !== "on") {
      return fail("Please tick the box to say you agree, and we'll take it from there.");
    }

    const requestHeaders = await headers();
    const ip = getClientIp(requestHeaders);

    const limit = limiter(`autopay-setup:${ip}`, SETUP_LIMIT, SETUP_WINDOW_MS);
    if (!limit.ok) {
      return fail("Too many attempts. Please wait a little while and try again.");
    }

    ({ url } = await startPortalAutopaySetup({
      ip,
      userAgent: requestHeaders.get("user-agent"),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("Your session has expired. Please sign in again.");
    }
    console.error("[startAutopayAction]", error);
    return fail("We couldn't start that just then. Please try again.");
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a working setup page into an error message.
  redirect(url);
}

// Takes no arguments: there is nothing to read off the form and nothing to
// carry over from the previous state. useActionState still calls it with both.
export async function disableAutopayAction(): Promise<PortalAutopayState> {
  try {
    await disablePortalAutopay();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("Your session has expired. Please sign in again.");
    }
    console.error("[disableAutopayAction]", error);
    return fail("We couldn't turn it off just then. Please try again.");
  }

  revalidatePath("/portal/autopay");
  revalidatePath("/portal");

  return { error: null };
}
