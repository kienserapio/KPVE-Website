import "server-only";

import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real bcrypt comparison.
 *
 * Called when no user matches the submitted email. Without it, a missing
 * account returns in ~1ms while a wrong password takes ~250ms, and that
 * timing difference alone tells an attacker which email addresses exist.
 */
export async function dummyCompare(): Promise<void> {
  // A real cost-12 hash, so bcrypt actually does the work (~430ms) instead of
  // rejecting a malformed hash instantly, which would defeat the whole point.
  await bcrypt.compare(
    "not-a-real-password",
    "$2b$12$F6pb7fgv4mR/pqfGQzqTtOSKVSA/rUlcfIQSzKKmbuT3sPz3Jrqle",
  );
}
