import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, clientUsers, staffUsers } from "@/lib/db/schema";
import type { ClientUserStatus } from "@/lib/db/schema";
import { generateAccessCode } from "@/lib/auth/portal-code";
import { requireSession } from "./session";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   Managing portal logins from the CRM. The staff side of client_users.

   The mirror image of lib/dal/portal-users.ts, which serves the sign-in path and
   deliberately authorizes nothing because it runs before anyone is signed in.
   Everything here starts with requireSession() instead, and none of it ever
   verifies a code — staff issue credentials, they never check them.

   The plaintext code exists only in the return value of the two functions that
   mint one. It is never stored, never logged, and cannot be read back: a lost
   code is reissued, exactly like an API key.
--------------------------------------------------------------------------- */

export type PortalUserItem = {
  id: string;
  name: string;
  email: string;
  status: ClientUserStatus;
  /**
   * Whether the row currently holds a code. Nothing nulls those columns today —
   * disabling leaves the code in place so that turning access back on restores
   * it — so this is true for every row the card renders. It is here because the
   * sign-in path treats a null hash as an unconditional refusal, and the UI
   * should say so rather than imply a code that isn't there.
   */
  hasCode: boolean;
  codeIssuedAt: Date | null;
  codeExpiresAt: Date | null;
  /** Both decided by Postgres — never compare timestamps in JS here. */
  isExpired: boolean;
  isLocked: boolean;
  lastLoginAt: Date | null;
  invitedByName: string | null;
};

/** Returned once, at the moment of minting. The `code` is the only copy. */
export type IssuedPortalAccess = {
  clientUserId: string;
  clientId: string;
  name: string;
  email: string;
  code: string;
  expiresAt: Date;
};

/** A blank Postgres unique-violation is 23505. */
const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * A selector is 40 bits, so a collision needs thousands of live codes before it
 * is even worth thinking about — but the column is unique, so a collision would
 * surface as a failed invite rather than as a silent overwrite. Mint again, the
 * same way invoice numbering retries.
 */
const MINT_ATTEMPTS = 3;

export async function listPortalUsers(clientId: string): Promise<PortalUserItem[]> {
  await requireSession();

  return db
    .select({
      id: clientUsers.id,
      name: clientUsers.name,
      email: clientUsers.email,
      status: clientUsers.status,
      hasCode: sql<boolean>`(${clientUsers.codeHash} is not null)`,
      codeIssuedAt: clientUsers.codeIssuedAt,
      codeExpiresAt: clientUsers.codeExpiresAt,
      isExpired: sql<boolean>`(${clientUsers.codeExpiresAt} is null or ${clientUsers.codeExpiresAt} <= now())`,
      isLocked: sql<boolean>`(${clientUsers.lockedUntil} is not null and ${clientUsers.lockedUntil} > now())`,
      lastLoginAt: clientUsers.lastLoginAt,
      invitedByName: staffUsers.name,
    })
    .from(clientUsers)
    .leftJoin(staffUsers, eq(clientUsers.createdBy, staffUsers.id))
    .where(eq(clientUsers.clientId, clientId))
    .orderBy(asc(clientUsers.createdAt));
}

/**
 * Give a person on this client a login for the first time.
 *
 * Separate from reissuing on purpose: "add someone" and "they lost their code"
 * are different intentions, and quietly turning the first into the second would
 * replace a working colleague's code because someone retyped an email.
 */
export async function issuePortalAccess(input: {
  clientId: string;
  name: string;
  email: string;
}): Promise<IssuedPortalAccess> {
  const staff = await requireSession();

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  // Without this the foreign key raises, and a deleted client would surface as
  // "Something went wrong" instead of "that record is gone".
  if (!client) throw new Error("NOT_FOUND");

  const [existing] = await db
    .select({ id: clientUsers.id })
    .from(clientUsers)
    .where(
      and(eq(clientUsers.clientId, input.clientId), eq(clientUsers.email, input.email)),
    )
    .limit(1);
  if (existing) throw new Error("ALREADY_INVITED");

  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const issued = generateAccessCode();

    try {
      const [row] = await db
        .insert(clientUsers)
        .values({
          clientId: input.clientId,
          name: input.name,
          email: input.email,
          codeSelector: issued.selector,
          codeHash: issued.codeHash,
          codeIssuedAt: sql`now()`,
          codeExpiresAt: issued.expiresAt,
          createdBy: staff.id,
        })
        .returning({ id: clientUsers.id });

      await logActivity({
        actorType: "staff",
        actorId: staff.id,
        entityType: "client",
        entityId: input.clientId,
        action: "portal_access.issued",
        // The code is never in here. Only who now has one.
        metadata: { clientUserId: row.id, email: input.email },
      });

      return {
        clientUserId: row.id,
        clientId: input.clientId,
        name: input.name,
        email: input.email,
        code: issued.code,
        expiresAt: issued.expiresAt,
      };
    } catch (error) {
      // Two unique indexes can raise this: the selector (retry) and
      // (client_id, email), which the check above already covered and only a
      // concurrent submit can hit.
      if (isUniqueViolation(error) && attempt < MINT_ATTEMPTS - 1) continue;
      if (isUniqueViolation(error)) throw new Error("ALREADY_INVITED");
      throw error;
    }
  }

  throw new Error("CODE_ALLOCATION_FAILED");
}

/**
 * A new code for someone who already has a login. The old one stops working at
 * once, and `sessions_valid_from` ends whatever sessions it had opened — losing
 * a code and being signed in on the machine that lost it are the same event.
 *
 * Also clears the failure backoff: someone who mistyped their way into a lock
 * and then asked for a new code should not have to wait it out as well.
 */
export async function reissuePortalCode(
  clientUserId: string,
): Promise<IssuedPortalAccess> {
  const staff = await requireSession();

  const [current] = await db
    .select({
      clientId: clientUsers.clientId,
      name: clientUsers.name,
      email: clientUsers.email,
      status: clientUsers.status,
    })
    .from(clientUsers)
    .where(eq(clientUsers.id, clientUserId))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");
  // Reissuing to a withdrawn login would hand out a code that cannot sign in.
  if (current.status === "disabled") throw new Error("ACCESS_DISABLED");

  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const issued = generateAccessCode();

    try {
      await db
        .update(clientUsers)
        .set({
          codeSelector: issued.selector,
          codeHash: issued.codeHash,
          codeIssuedAt: sql`now()`,
          codeExpiresAt: issued.expiresAt,
          failedAttempts: 0,
          lockedUntil: null,
          sessionsValidFrom: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(clientUsers.id, clientUserId));

      await logActivity({
        actorType: "staff",
        actorId: staff.id,
        entityType: "client",
        entityId: current.clientId,
        action: "portal_access.code_reissued",
        metadata: { clientUserId, email: current.email },
      });

      return {
        clientUserId,
        clientId: current.clientId,
        name: current.name,
        email: current.email,
        code: issued.code,
        expiresAt: issued.expiresAt,
      };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < MINT_ATTEMPTS - 1) continue;
      throw error;
    }
  }

  throw new Error("CODE_ALLOCATION_FAILED");
}

/**
 * The off switch, and the way back on.
 *
 * Disabling stamps `sessions_valid_from` as well as setting the status. The
 * status alone already ends open sessions — it is read on every request — and
 * the stamp is there so that a login turned off and on again does not resurrect
 * the session someone had at the time.
 *
 * Enabling restores `invited` or `active` rather than forcing `active`, because
 * "has never signed in" is a real distinction: it is what the Remove button is
 * allowed to act on.
 */
export async function setPortalAccessDisabled(
  clientUserId: string,
  disabled: boolean,
): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .update(clientUsers)
    .set(
      disabled
        ? {
            status: "disabled",
            sessionsValidFrom: sql`now()`,
            updatedAt: sql`now()`,
          }
        : {
            status: sql`case when ${clientUsers.lastLoginAt} is null then 'invited'::client_user_status else 'active'::client_user_status end`,
            updatedAt: sql`now()`,
          },
    )
    .where(eq(clientUsers.id, clientUserId))
    .returning({ clientId: clientUsers.clientId, email: clientUsers.email });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: disabled ? "portal_access.disabled" : "portal_access.enabled",
    metadata: { clientUserId, email: row.email },
  });

  return { clientId: row.clientId };
}

/**
 * Clear a sign-in backoff by hand.
 *
 * The backoff exists so that nobody holding a client's email address can lock
 * them out permanently, and it caps at five minutes for the same reason. This
 * is the "they rang us and they are who they say they are" escape hatch, so
 * they don't sit out a wait they earned by typing their own code wrong.
 */
export async function unlockPortalUser(
  clientUserId: string,
): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .update(clientUsers)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: sql`now()` })
    .where(eq(clientUsers.id, clientUserId))
    .returning({ clientId: clientUsers.clientId, email: clientUsers.email });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: row.clientId,
    action: "portal_access.unlocked",
    metadata: { clientUserId, email: row.email },
  });

  return { clientId: row.clientId };
}

/**
 * Delete a login outright — for the mistyped address, not for withdrawing
 * access.
 *
 * Refused once they have signed in, because the row is what the audit trail
 * resolves a portal actor's name from: delete it and every "Client signed in"
 * entry it produced renders with a blank actor. Access is withdrawn by
 * disabling, which keeps the history and is just as final from outside.
 */
export async function removePortalUser(
  clientUserId: string,
): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [current] = await db
    .select({
      clientId: clientUsers.clientId,
      email: clientUsers.email,
      lastLoginAt: clientUsers.lastLoginAt,
    })
    .from(clientUsers)
    .where(eq(clientUsers.id, clientUserId))
    .limit(1);
  if (!current) throw new Error("NOT_FOUND");
  if (current.lastLoginAt) throw new Error("HAS_SIGNED_IN");

  // The condition is in the statement as well as in the check above: the two
  // are separate round trips, and a first sign-in landing between them must not
  // delete the row the audit trail has just started pointing at.
  const [deleted] = await db
    .delete(clientUsers)
    .where(and(eq(clientUsers.id, clientUserId), isNull(clientUsers.lastLoginAt)))
    .returning({ id: clientUsers.id });
  if (!deleted) throw new Error("HAS_SIGNED_IN");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: current.clientId,
    action: "portal_access.removed",
    metadata: { clientUserId, email: current.email },
  });

  return { clientId: current.clientId };
}
