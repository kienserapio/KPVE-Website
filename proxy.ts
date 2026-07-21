import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. Runtime is always nodejs and
 * cannot be configured.
 *
 * This is an OPTIMISTIC check only. It reads whether a session cookie exists
 * and redirects if not — it does not verify the signature, hit the database,
 * or make any trust decision. It runs on every matched request including
 * prefetches, so it stays cheap.
 *
 * Real authorization lives in lib/dal/session.ts. Server Actions are POSTs to
 * their own page's route, so a matcher that skips a path also skips the actions
 * on it — which is exactly why every action calls requireSession() itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/admin") && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    // Bounce back to the requested page after a successful login.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in — no reason to show the login form.
  if (pathname === "/login" && hasSessionCookie) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
