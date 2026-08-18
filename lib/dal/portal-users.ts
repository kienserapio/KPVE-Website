import "server-only";

import { and, eq, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientUsers } from "@/lib/db/schema";

/* ---------------------------------------------------------------------------
   The client_users reads and writes the SIGN-IN path needs, and nothing else.

   Nothing here calls requireSession() or requirePortalSession(), because none
   of it can: it runs before anyone is authenticated. That is exactly why it
   lives in its own file with this warning on it rather than beside the portal's
   ordinary, session-scoped reads.
--------------------------------------------------------------------------- */

export type PortalUserForAuth = {
  id: string;
  clientId: string;
  email: string;
  status: "invited" | "active" | "disabled";
  codeHash: string | null;
  isLocked: boolean;
  isExpired: boolean;
};

/**
 * Internal — returns the stored code hash, so this must never be called from
 * anything that renders. Sign-in only.
 *
 * Looks up by SELECTOR, which is unique, so this is a single indexed row no
 * matter how many accounts share an email address. The alternative — find every
 * row for the submitted email and test the code against each — makes the work
 * proportional to a number the caller chooses, which is both a timing oracle
 * ("that address is on three KPVE accounts") and a CPU-exhaustion lever.
 *
 * The two time-based decisions come back as BOOLEANS decided by Postgres, not
 * as timestamps compared in JS. Two reasons, one of which already bit:
 *
 *   1. drizzle's postgres-js driver installs pass-through parsers for the
 *      timestamp type OIDs and a bare `sql` fragment carries a no-op decoder,
 *      so `sql<Date>`now()`` arrives as a STRING however it is typed. Every
 *      comparison against a real Date column then silently evaluates false,
 *      which is a lockout that never locks and a code that never expires — with
 *      no error anywhere.
 *   2. A lambda's clock and the database's are two different clocks. Deciding
 *      in SQL removes the skew question entirely.
 */
export async function findPortalUserBySelectorForAuth(
  selector: string,
): Promise<PortalUserForAuth | null> {
  const [row] = await db
    .select({
      id: clientUsers.id,
      clientId: clientUsers.clientId,
      email: clientUsers.email,
      status: clientUsers.status,
      codeHash: clientUsers.codeHash,
      isLocked: sql<boolean>`(${clientUsers.lockedUntil} is not null and ${clientUsers.lockedUntil} > now())`,
      isExpired: sql<boolean>`(${clientUsers.codeExpiresAt} is null or ${clientUsers.codeExpiresAt} <= now())`,
    })
    .from(clientUsers)
    .where(eq(clientUsers.codeSelector, selector))
    .limit(1);

  return row ?? null;
}

/**
 * Exponential backoff, computed and stored by Postgres so it is durable and
 * shared across instances — unlike lib/rate-limit.ts, which a cold start wipes.
 *
 * Backoff rather than a hard lockout: an attacker who has seen an invoice knows
 * the client's email, and a wall would let them keep a paying client out of
 * their own account for as long as they cared to keep posting. Doubling from
 * two seconds and capping at five minutes costs a legitimate fat-fingered
 * client almost nothing and cuts an attacker to a dozen tries an hour. The
 * exponent is capped as well, so a long-abandoned row can't overflow power().
 *
 * The WHERE refuses to touch a row that is already serving a lock. The caller
 * checks that too, but the check and this write are separate round trips, and
 * concurrent attempts would otherwise each bump the counter for one lock.
 */
export async function recordPortalLoginFailure(clientUserId: string): Promise<void> {
  await db
    .update(clientUsers)
    .set({
      failedAttempts: sql`${clientUsers.failedAttempts} + 1`,
      lockedUntil: sql`now() + least(power(2, least(${clientUsers.failedAttempts} + 1, 16)) * interval '1 second', interval '5 minutes')`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(clientUsers.id, clientUserId),
        or(isNull(clientUsers.lockedUntil), lte(clientUsers.lockedUntil, sql`now()`)),
      ),
    );
}

/**
 * A successful sign-in clears the backoff — otherwise a client who eventually
 * typed it right would still be serving out a lock — and flips `invited` to
 * `active`, which is the only thing that distinguishes the two.
 *
 * It refuses to touch a row that is already `disabled`. The status was read at
 * the start of the sign-in, and staff can withdraw access in the moments
 * between that read and this write; without the guard, the sign-in would write
 * `active` back over their decision. Losing the timestamp on that one attempt
 * costs nothing — the session it minted dies on its next request, because
 * getPortalSession re-reads the status every time.
 */
export async function recordPortalLogin(clientUserId: string): Promise<void> {
  await db
    .update(clientUsers)
    .set({
      status: "active",
      lastLoginAt: sql`now()`,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(clientUsers.id, clientUserId), ne(clientUsers.status, "disabled")));
}
