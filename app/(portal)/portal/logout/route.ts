import { NextResponse } from "next/server";

import { destroyPortalSession } from "@/lib/auth/portal-session";

/* ---------------------------------------------------------------------------
   Clear the portal session cookie and go to the portal sign-in.

   The sign-out BUTTON is a server action (lib/actions/portal-auth.ts) and stays
   that way — it logs the event and is a POST, which is what a state change
   should be. This route exists for the one case an action can't serve: a cookie
   that verifies but resolves to no live account.

   That combination deadlocks the portal. proxy.ts trusts the presence of a
   cookie and sends /portal/login → /portal; verifyPortalSession finds no live
   account and sends /portal → /portal/login. Neither can break the loop,
   because clearing a cookie is not something a page or a layout is allowed to
   do — only a route handler or an action. So verifyPortalSession redirects
   here, this clears it, and the browser lands on a sign-in form instead of an
   error. proxy.ts lets this path through with or without a cookie for the same
   reason.

   It clears ONLY the portal cookie. A staff member whose portal session went
   stale must not be signed out of the CRM as collateral, which is why /logout
   and this route stay separate.

   It is a GET on purpose: it is reached by redirect, not by a form. It destroys
   only the caller's own cookie, so there is nothing here for a CSRF to take.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await destroyPortalSession();
  return NextResponse.redirect(new URL("/portal/login", request.url));
}
