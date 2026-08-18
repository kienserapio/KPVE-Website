import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/* ---------------------------------------------------------------------------
   The client portal's session cookie. A deliberate twin of lib/auth/session.ts
   rather than a shared, parameterised version of it: two cookies, two secrets,
   two audiences, no branch anywhere that could take the wrong one.

   `__Host-` in production is what stops a subdomain (or an XSS on one) from
   writing a cookie this app would then read as its own — the prefix forbids a
   Domain attribute and requires Secure + Path=/. The prefix is dropped outside
   production because a browser rejects a `__Host-` cookie that isn't Secure,
   and local development is http://localhost.
--------------------------------------------------------------------------- */

export const PORTAL_SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-kpve_portal" : "kpve_portal";

/**
 * Pinned into every portal token and demanded of every portal token. Even if
 * the two secrets were ever accidentally made equal, a staff token could not
 * satisfy a portal check or the reverse — jose rejects the wrong audience.
 */
const PORTAL_AUDIENCE = "kpve:portal";

/**
 * Long enough that a client isn't re-typing a 24-character code to look at an
 * invoice, short enough that a shared office machine forgets. Sliding this on
 * activity would be the upgrade, not a longer absolute life.
 */
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * A skewed lambda clock must not reject a token another lambda minted a second
 * ago. jose's default tolerance is zero.
 */
const CLOCK_TOLERANCE_SECONDS = 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "PORTAL_SESSION_SECRET is not set. Generate one with: openssl rand -base64 32",
    );
  }

  // Never let the two session families share a key. The audience claim already
  // makes cross-use impossible, but a shared secret is the kind of shortcut
  // that gets taken when a deploy fails on a missing variable, and this fails
  // loudly at the first request instead.
  if (secret === process.env.SESSION_SECRET) {
    throw new Error(
      "PORTAL_SESSION_SECRET must differ from SESSION_SECRET. Generate a second one with: openssl rand -base64 32",
    );
  }

  return new TextEncoder().encode(secret);
}

export type PortalSessionPayload = {
  clientUserId: string;
  clientId: string;
  /** Issued-at, ms. Compared against client_users.sessions_valid_from. */
  issuedAt: number;
  expiresAt: number;
};

export async function encrypt(
  payload: Pick<PortalSessionPayload, "clientUserId" | "clientId"> & {
    expiresAt: number;
  },
): Promise<string> {
  return new SignJWT({
    clientUserId: payload.clientUserId,
    clientId: payload.clientId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(PORTAL_AUDIENCE)
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getSecretKey());
}

/**
 * Returns null for anything that isn't a valid, unexpired, correctly-signed
 * portal token. Never throws — callers treat null as "not authenticated".
 */
export async function decrypt(
  token: string | undefined,
): Promise<PortalSessionPayload | null> {
  if (!token) return null;

  // Resolved OUTSIDE the try. A missing or duplicated secret is a deployment
  // fault and must surface as one; caught here it would read as "not
  // authenticated" and every client would silently see a sign-in form.
  const key = getSecretKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], // pin the algorithm — never trust the token's own header
      audience: PORTAL_AUDIENCE, // a staff token can never satisfy this
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    if (typeof payload.clientUserId !== "string" || !payload.clientUserId) return null;
    if (typeof payload.clientId !== "string" || !payload.clientId) return null;

    return {
      clientUserId: payload.clientUserId,
      clientId: payload.clientId,
      issuedAt: (payload.iat ?? 0) * 1000,
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    // Expired, tampered, wrong secret, wrong audience, malformed — all the
    // same to us.
    return null;
  }
}

export async function createPortalSession(
  clientUserId: string,
  clientId: string,
): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await encrypt({ clientUserId, clientId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript — blunts XSS token theft
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // clients arrive by clicking a link in their email; strict would drop the cookie on that first navigation
    expires: new Date(expiresAt),
    path: "/", // required by the __Host- prefix, and lets /portal/logout clear it from anywhere
  });
}

/**
 * An expiring SET rather than cookieStore.delete(), and that is load-bearing.
 *
 * delete() emits `name=; Path=/; Expires=Thu, 01 Jan 1970` and nothing else —
 * no Secure. A browser ignores any `__Host-` cookie whose Set-Cookie lacks
 * Secure, so in production the delete would be discarded and the cookie would
 * survive: sign-out would do nothing, and a revoked session would bounce
 * /portal → /portal/logout → /portal/login → /portal forever. Invisible in
 * development, where the name carries no prefix.
 */
export async function destroyPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
