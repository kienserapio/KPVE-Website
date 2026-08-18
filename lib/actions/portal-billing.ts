"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvoiceCheckout } from "@/lib/dal/payments";
import { getPortalInvoice } from "@/lib/dal/portal";
import { requirePortalSession } from "@/lib/dal/portal-session";
import { logActivity } from "@/lib/dal/activity";
import { createRateLimiter } from "@/lib/rate-limit";
import { PORTAL_THEME_COOKIE } from "@/lib/portal-theme";

/* ---------------------------------------------------------------------------
   What a signed-in client can DO, as opposed to see.

   There is exactly one thing: pay an invoice. The portal is otherwise read-only
   by design — a client cannot change a price, cancel a line or edit a document,
   because every one of those is a conversation before it is a database write.

   This is a second path to the same checkout the emailed invoice link already
   offers (payInvoiceAction in lib/actions/payments.ts), and the difference is
   what authorizes it. There, the 32-hex token in the URL is the credential.
   Here it is the portal session, and the invoice id is checked against the
   client that session resolved to — so the token never has to be rendered into
   the portal's HTML at all. Two entry points, one checkout, no third way to
   mint a session.
--------------------------------------------------------------------------- */

export type PortalPayState = { error: string | null };

const fail = (error: string): PortalPayState => ({ error });

/**
 * Its own limiter, not the shared map. Minting a Checkout Session is a call out
 * to Stripe, and a flood here must not empty the counters protecting the portal
 * sign-in or the contact form — see createRateLimiter().
 */
const limiter = createRateLimiter();

const PAY_LIMIT = 20;
const PAY_WINDOW_MS = 60 * 60 * 1000;

export async function payPortalInvoiceAction(
  _prev: PortalPayState,
  formData: FormData,
): Promise<PortalPayState> {
  let session;
  try {
    session = await requirePortalSession();
  } catch {
    return fail("Your session has expired. Please sign in again.");
  }

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return fail("That invoice is no longer available.");

  // Keyed by the SIGNED-IN USER, not by IP. An office behind one address is one
  // key at the door; here the caller is authenticated, so the limit can follow
  // the account and a busy office cannot lock its own colleagues out.
  const limit = limiter(`portal-pay:${session.clientUserId}`, PAY_LIMIT, PAY_WINDOW_MS);
  if (!limit.ok) {
    return fail("Too many attempts. Please wait a little while and try again.");
  }

  let url: string;
  try {
    // Scoped to the session's own client inside the query — another client's
    // invoice id comes back null here, exactly as a made-up one does.
    const invoice = await getPortalInvoice(invoiceId);
    if (!invoice) return fail("That invoice is no longer available.");

    if (!invoice.payable) {
      return fail(
        invoice.status === "paid"
          ? "This invoice is already paid — nothing to do."
          : "This invoice can't be paid online right now. Please get in touch.",
      );
    }

    ({ url } = await createInvoiceCheckout(invoice.id));

    await logActivity({
      actorType: "client",
      actorId: session.clientUserId,
      entityType: "invoice",
      entityId: invoice.id,
      action: "portal.checkout_started",
      metadata: { number: invoice.number },
    });
  } catch (error) {
    console.error("[payPortalInvoiceAction]", error);
    return fail("We couldn't open the checkout just then. Please try again.");
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // turn a working checkout into "something went wrong".
  redirect(url);
}

/* ---------------------------------------------------------------------------
   Appearance
--------------------------------------------------------------------------- */

export async function setPortalThemeAction(theme: "light" | "dark"): Promise<void> {
  // No session check on purpose: this decides a colour. Gating it would mean a
  // failed portal request could not even render the sign-in form in the theme
  // the person chose.
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_THEME_COOKIE, theme === "dark" ? "dark" : "light", {
    httpOnly: false, // purely cosmetic; no security value in hiding it
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/portal", "layout");
}
