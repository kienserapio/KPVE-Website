"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { portalLoginSchema } from "@/lib/validation";
import {
  findPortalUserBySelectorForAuth,
  recordPortalLogin,
  recordPortalLoginFailure,
} from "@/lib/dal/portal-users";
import { parseAccessCode, verifyAccessCode } from "@/lib/auth/portal-code";
import { createPortalSession, destroyPortalSession } from "@/lib/auth/portal-session";
import { getPortalSession } from "@/lib/dal/portal-session";
import { safeNext } from "@/lib/auth/redirect";
import { logActivity } from "@/lib/dal/activity";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

export type PortalLoginState = { error: string | null };

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Its own limiter, not the shared one. This endpoint's keys come from the
 * public internet, and the shared map empties itself wholesale when it fills —
 * so a flood here would otherwise clear the counters protecting the staff login
 * and the contact form. See createRateLimiter().
 */
const limiter = createRateLimiter();

/**
 * Deliberately identical for "no such code", "wrong email", "expired code",
 * "locked out" and "access withdrawn". Anything more specific tells whoever is
 * guessing which half they got right, or confirms that an account exists.
 */
const GENERIC_ERROR = "That email and access code don't match.";

/**
 * Every exit from a sign-in attempt takes at least this long.
 *
 * The staff login equalises timing with a decoy bcrypt (dummyCompare), which
 * works because every real path also pays for a bcrypt. Here the real work is a
 * SHA-256 and an indexed lookup — microseconds — so the only thing separating
 * "unknown code" from "locked account" from "success" is how much of the
 * function ran. A floor makes them all indistinguishable.
 */
const MIN_RESPONSE_MS = 600;

async function hold(startedAt: number): Promise<void> {
  const remaining = MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export async function portalLogin(
  _prevState: PortalLoginState,
  formData: FormData,
): Promise<PortalLoginState> {
  const startedAt = Date.now();

  const ip = getClientIp(await headers());
  const limit = limiter(`portal-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    await hold(startedAt);
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = portalLoginSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    await hold(startedAt);
    return { error: GENERIC_ERROR };
  }

  // Cheap shape check before touching the database — the code is user input.
  const submitted = parseAccessCode(parsed.data.code);
  if (!submitted) {
    await hold(startedAt);
    return { error: GENERIC_ERROR };
  }

  const user = await findPortalUserBySelectorForAuth(submitted.selector);

  // No such selector, access withdrawn, or a row whose code was revoked. None
  // of these get their own message, and none of them touch the row.
  if (!user || !user.codeHash || user.status === "disabled") {
    await hold(startedAt);
    return { error: GENERIC_ERROR };
  }

  // Both decided by Postgres and returned with the row — see the comment on
  // findPortalUserBySelectorForAuth. Neither writes anything: a request that is
  // already throttled must not extend its own lock, or an attacker could hold a
  // client out indefinitely for the cost of one request a minute.
  if (user.isLocked || user.isExpired) {
    await hold(startedAt);
    return { error: GENERIC_ERROR };
  }

  // Both checks run before either is acted on, so a wrong email and a wrong
  // code are the same request from the outside.
  const emailMatches = user.email === parsed.data.email;
  const codeMatches = verifyAccessCode(submitted.verifier, user.codeHash);

  if (!emailMatches || !codeMatches) {
    await recordPortalLoginFailure(user.id);
    await logActivity({
      actorType: "system",
      entityType: "client",
      entityId: user.clientId,
      action: "portal.login.failed",
    });
    await hold(startedAt);
    return { error: GENERIC_ERROR };
  }

  await createPortalSession(user.id, user.clientId);
  await recordPortalLogin(user.id);
  await logActivity({
    actorType: "client",
    actorId: user.id,
    entityType: "client",
    entityId: user.clientId,
    action: "portal.login.success",
  });

  // Only ever a path inside the portal. A raw `next` from the query string
  // would be an open redirect, and one that merely started with "/" would let
  // a client be aimed at /admin.
  const next = safeNext(formData.get("next"), "/portal", "/portal");

  await hold(startedAt);
  redirect(next);
}

export async function portalLogout(): Promise<void> {
  const client = await getPortalSession();
  if (client) {
    await logActivity({
      actorType: "client",
      actorId: client.clientUserId,
      entityType: "client",
      entityId: client.clientId,
      action: "portal.logout",
    });
  }
  await destroyPortalSession();
  redirect("/portal/login");
}
