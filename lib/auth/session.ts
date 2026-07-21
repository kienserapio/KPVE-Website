import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "kpve_session";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getSecretKey());
}

/**
 * Returns null for anything that isn't a valid, unexpired, correctly-signed
 * token. Never throws — callers treat null as "not authenticated".
 */
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"], // pin the algorithm — never trust the token's own header
    });

    if (typeof payload.staffId !== "string" || !payload.staffId) return null;

    return {
      staffId: payload.staffId,
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    // Expired, tampered, wrong secret, malformed — all the same to us.
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
