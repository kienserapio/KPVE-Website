import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";
import { PORTAL_SESSION_COOKIE } from "@/lib/auth/portal-session";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. Runtime is always nodejs and
 * cannot be configured. Only one such file is supported per project, so both
 * gates live here and branch on the path.
 *
 * This is an OPTIMISTIC check only. It reads whether a session cookie exists
 * and redirects if not — it does not verify the signature, hit the database,
 * or make any trust decision. It runs on every matched request including
 * prefetches, so it stays cheap.
 *
 * Real authorization lives in lib/dal/session.ts (staff) and
 * lib/dal/portal-session.ts (clients). Server Actions are POSTs to their own
 * page's route, so a matcher that skips a path also skips the actions on it —
 * which is exactly why every action calls requireSession() itself.
 *
 * The two gates never read each other's cookie. Holding one must not open the
 * other, and a staff member testing a client login must still be able to reach
 * both sign-in forms.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/portal")) {
    return portalGate(request, pathname);
  }

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

function portalGate(request: NextRequest, pathname: string) {
  // Must stay reachable with a cookie or without one: it is the only thing that
  // can clear a cookie that verifies but no longer resolves to an account, and
  // gating it is how the /portal ↔ /portal/login ping-pong becomes permanent.
  if (pathname === "/portal/logout") return NextResponse.next();

  const hasPortalCookie = Boolean(request.cookies.get(PORTAL_SESSION_COOKIE)?.value);

  if (pathname === "/portal/login") {
    return hasPortalCookie
      ? NextResponse.redirect(new URL("/portal", request.url))
      : NextResponse.next();
  }

  if (!hasPortalCookie) {
    const loginUrl = new URL("/portal/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // A literal allow-list. `/portal` is listed separately from `/portal/:path*`
  // rather than relying on the zero-or-more form to cover the bare path.
  matcher: ["/admin/:path*", "/login", "/portal", "/portal/:path*"],
};
