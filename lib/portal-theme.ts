import "server-only";

import { cookies } from "next/headers";

/**
 * The portal's own theme cookie — NOT `kpve_theme`, which is the staff one.
 *
 * They are separate for the same reason the sessions are: a staff member who
 * prefers the CRM dark should not have decided how their clients' portal looks,
 * and a client flipping a switch must not reach into anything staff-facing.
 * Cosmetic either way, so it is readable from JavaScript and nothing trusts it.
 *
 * Lives here rather than beside the action that writes it because a `use server`
 * module may only export async functions — a plain string constant in one is a
 * build error.
 */
export const PORTAL_THEME_COOKIE = "kpve_portal_theme";

export type PortalTheme = "light" | "dark";

/** Read once per request, in the layout, so the first HTML is already correct. */
export async function getPortalTheme(): Promise<PortalTheme> {
  const value = (await cookies()).get(PORTAL_THEME_COOKIE)?.value;
  // Light is the default here, unlike the CRM: a client arrives from an emailed
  // invoice, and /invoice/[token] is a light sheet. Landing on a black screen
  // from a white one reads as a different company.
  return value === "dark" ? "dark" : "light";
}
