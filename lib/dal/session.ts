import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";
import { SESSION_COOKIE, decrypt } from "@/lib/auth/session";

export type SessionStaff = {
  id: string;
  email: string;
  name: string;
};

/**
 * The authoritative auth check. proxy.ts only redirects on a missing cookie —
 * it makes no trust decisions. This does, and every page, server action and
 * protected route handler must go through it.
 *
 * Wrapped in React's cache() so repeated calls within one render pass hit the
 * database once.
 */
export const getSession = cache(async (): Promise<SessionStaff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await decrypt(token);
  if (!payload?.staffId) return null;

  // A valid signature is not enough. The account may have been deactivated or
  // deleted since the token was issued, and the token would still verify.
  const [staff] = await db
    .select({
      id: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      isActive: staffUsers.isActive,
    })
    .from(staffUsers)
    .where(eq(staffUsers.id, payload.staffId))
    .limit(1);

  if (!staff || !staff.isActive) return null;

  return { id: staff.id, email: staff.email, name: staff.name };
});

/** Use in pages and layouts. Redirects to login when unauthenticated. */
export async function verifySession(): Promise<SessionStaff> {
  const staff = await getSession();
  if (!staff) redirect("/login");
  return staff;
}

/**
 * Use in server actions and route handlers, where a redirect would be a
 * confusing response. Throws instead.
 */
export async function requireSession(): Promise<SessionStaff> {
  const staff = await getSession();
  if (!staff) throw new Error("UNAUTHORIZED");
  return staff;
}
