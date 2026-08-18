import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientUsers, clients } from "@/lib/db/schema";
import { PORTAL_SESSION_COOKIE, decrypt } from "@/lib/auth/portal-session";

export type SessionClient = {
  clientUserId: string;
  /** The account every portal query is scoped to. It comes from HERE, never from a URL. */
  clientId: string;
  /** The person signed in. */
  name: string;
  email: string;
  /** The account they are looking at — the trading name or individual on file. */
  clientName: string;
};

/**
 * A token's issued-at is truncated to whole seconds, so a session minted in the
 * same second as the `sessions_valid_from` it is checked against can appear to
 * predate it. A few seconds of slack costs nothing: revoking access is measured
 * in the time it takes staff to press a button, not in milliseconds.
 */
const ISSUED_AT_TOLERANCE_MS = 5000;

/**
 * The authoritative auth check for the client portal. proxy.ts only redirects
 * on a missing cookie — it makes no trust decisions. This does, and every
 * portal page, server action and route handler must go through it.
 *
 * Wrapped in React's cache() so repeated calls within one render pass hit the
 * database once. cache() is scoped to a single request, not to the module, so
 * nothing here is shared between two clients being served concurrently.
 */
export const getPortalSession = cache(async (): Promise<SessionClient | null> => {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value;
  const payload = await decrypt(token);
  if (!payload?.clientUserId) return null;

  // A valid signature is not enough. Access may have been withdrawn since the
  // token was issued, and the token would still verify.
  const [row] = await db
    .select({
      id: clientUsers.id,
      clientId: clientUsers.clientId,
      name: clientUsers.name,
      email: clientUsers.email,
      status: clientUsers.status,
      sessionsValidFrom: clientUsers.sessionsValidFrom,
      clientName: clients.name,
    })
    .from(clientUsers)
    .innerJoin(clients, eq(clientUsers.clientId, clients.id))
    .where(eq(clientUsers.id, payload.clientUserId))
    .limit(1);

  if (!row) return null;

  // `disabled` is the off switch, and it is read on every request rather than
  // only at sign-in, so switching it off ends the sessions already open.
  if (row.status === "disabled") return null;

  // Sign out everywhere: staff reissuing a code or withdrawing access stamps
  // sessions_valid_from, and every token older than it stops working.
  if (payload.issuedAt + ISSUED_AT_TOLERANCE_MS < row.sessionsValidFrom.getTime()) {
    return null;
  }

  // The account the token names is the one the row says. A tampered clientId
  // could not have survived the signature check, but reading it from the row
  // means no portal query ever depends on a value that arrived from outside.
  return {
    clientUserId: row.id,
    clientId: row.clientId,
    name: row.name,
    email: row.email,
    clientName: row.clientName,
  };
});

/**
 * Use in portal pages and layouts. Redirects to the portal sign-in when
 * unauthenticated.
 *
 * A cookie that still verifies but no longer resolves to a live account — access
 * withdrawn, code reissued, the client record deleted — needs more than a
 * redirect to /portal/login. proxy.ts trusts the mere PRESENCE of a cookie and
 * bounces /portal/login → /portal, while this bounces /portal → /portal/login,
 * and the browser ping-pongs until it gives up. The only way out is to clear the
 * cookie, which a page cannot do; a route handler can, so stale sessions are
 * sent through /portal/logout instead.
 */
export async function verifyPortalSession(): Promise<SessionClient> {
  const client = await getPortalSession();
  if (client) return client;

  const hasCookie = Boolean((await cookies()).get(PORTAL_SESSION_COOKIE)?.value);
  redirect(hasCookie ? "/portal/logout" : "/portal/login");
}

/**
 * Use in portal server actions and route handlers, where a redirect would be a
 * confusing response. Throws instead.
 */
export async function requirePortalSession(): Promise<SessionClient> {
  const client = await getPortalSession();
  if (!client) throw new Error("UNAUTHORIZED");
  return client;
}
