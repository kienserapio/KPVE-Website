import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   Clear the session cookie and go to the login page.

   The sign-out BUTTON is a server action (lib/actions/auth.ts) and stays that
   way — it logs the event and is a POST, which is what a state change should
   be. This route exists for the one case an action can't serve: a cookie that
   verifies but resolves to no active account.

   That combination deadlocks the app. proxy.ts trusts the presence of a cookie
   and sends /login → /admin; verifySession finds no account and sends /admin →
   /login. Neither can break the loop, because clearing a cookie is not
   something a page or a layout is allowed to do — only a route handler or an
   action. So verifySession redirects here, this clears it, and the browser
   lands on a login form instead of an error.

   It is a GET on purpose: it is reached by redirect, not by a form. It destroys
   only the caller's own cookie, so there is nothing here for a CSRF to take.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
