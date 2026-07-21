import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { staffUsers } from "@/lib/db/schema";
import { requireSession } from "./session";

/**
 * Internal — returns the password hash, so this must never be called from
 * anything that renders. Login only.
 */
export async function findStaffByEmailForAuth(email: string) {
  const [staff] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1);
  return staff ?? null;
}

export async function recordLogin(staffId: string): Promise<void> {
  await db
    .update(staffUsers)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(staffUsers.id, staffId));
}

export type StaffOption = { id: string; name: string; email: string };

/** For the "assign to" dropdown. Authorized, and never returns a hash. */
export async function listActiveStaff(): Promise<StaffOption[]> {
  await requireSession();

  return db
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      email: staffUsers.email,
    })
    .from(staffUsers)
    .where(eq(staffUsers.isActive, true))
    .orderBy(staffUsers.name);
}
