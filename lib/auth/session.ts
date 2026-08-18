import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "kpve_session";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Stamped into every staff token and demanded of every staff token, so it can
 * never be mistaken for the client portal's (lib/auth/portal-session.ts) even
 * if the two secrets were ever accidentally made equal. Adding this invalidated
 * the tokens issued before it existed — a one-off sign-in, nothing more.
 */
const STAFF_AUDIENCE = "kpve:staff";

/** A skewed lambda clock must not reject a token another lambda just minted. */
const CLOCK_TOLERANCE_SECONDS = 30;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  staffId: string;
  expiresAt: number;
};

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT({ staffId: payload.staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(STAFF_AUDIENCE)
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getSecretKey());
}

/**
 * Returns null for anything that isn't a valid, unexpired, correctly-signed
 * token. Never throws — callers treat null as "not authenticated".
 */
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  // Resolved OUTSIDE the try: a missing SESSION_SECRET is a deployment fault,
  // and caught here it would read as "not authenticated" instead.
  const key = getSecretKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], // pin the algorithm — never trust the token's own header
      audience: STAFF_AUDIENCE, // a portal token can never satisfy this
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    if (typeof payload.staffId !== "string" || !payload.staffId) return null;

    return {
      staffId: payload.staffId,
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    // Expired, tampered, wrong secret, wrong audience, malformed — all the
    // same to us.
    return null;
  }
}

export async function createSession(staffId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await encrypt({ staffId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript — blunts XSS token theft
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // blocks CSRF on cross-site POSTs while keeping normal links working
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
