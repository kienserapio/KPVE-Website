"use server";

import { redirect } from "next/navigation";

import { loginSchema } from "@/lib/validation";
import { findStaffByEmailForAuth, recordLogin } from "@/lib/dal/staff";
import { verifyPassword, dummyCompare } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/redirect";
import { getSession } from "@/lib/dal/session";
import { logActivity } from "@/lib/dal/activity";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { getClientIp } from "@/lib/rate-limit";

export type LoginState = { error: string | null };

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// Deliberately identical for "no such user", "wrong password", and
// "deactivated account". Anything more specific is an account-enumeration
// oracle.
const GENERIC_ERROR = "Invalid email or password.";

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const ip = getClientIp(await headers());
  const limit = rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }

  const staff = await findStaffByEmailForAuth(parsed.data.email);

  if (!staff || !staff.isActive) {
    // Burn comparable time so a missing account isn't detectable by latency.
    await dummyCompare();
    return { error: GENERIC_ERROR };
  }

  const valid = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!valid) {
    await logActivity({
      actorType: "system",
      entityType: "auth",
      entityId: staff.id,
      action: "login.failed",
      metadata: { email: parsed.data.email },
    });
    return { error: GENERIC_ERROR };
  }

  await createSession(staff.id);
  await recordLogin(staff.id);
  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "auth",
    entityId: staff.id,
    action: "login.success",
  });

  // Only ever redirect to a relative path on this site. Taking a raw `next`
  // value from the query string would be an open-redirect.
  redirect(safeNext(formData.get("next"), "/", "/admin"));
}

export async function logout(): Promise<void> {
  const staff = await getSession();
  if (staff) {
    await logActivity({
      actorType: "staff",
      actorId: staff.id,
      entityType: "auth",
      entityId: staff.id,
      action: "logout",
    });
  }
  await destroySession();
  redirect("/login");
}
