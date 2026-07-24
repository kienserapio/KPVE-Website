import "server-only";

import { cache } from "react";
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { orgSettings, type OrgSettings } from "@/lib/db/schema";
import type { TaxSettings } from "@/lib/billing";
import { requireSession } from "./session";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   org_settings — who KPVE is, on paper.

   One row, edited at /admin/settings, read live by anything that prints a
   document. Kept out of env vars for the same reason the service catalogue is
   a table: an ABN or a bank account changing must not be a deploy, and the
   person who knows the right value is not the person with shell access.
--------------------------------------------------------------------------- */

export type OrgSettingsRecord = OrgSettings;

/**
 * The one row.
 *
 * There is deliberately no unique constraint on the table — a partial unique
 * index on "the only row" is a piece of schema nobody would understand a year
 * from now. The cost of that is a vanishingly rare double row if two very
 * first requests race the self-seed below, so every read is ordered
 * `created_at asc limit 1`: whichever row won the race, everyone agrees which
 * one is authoritative, and the loser is inert.
 */
async function selectSettingsRow(): Promise<OrgSettingsRecord | null> {
  const [row] = await db
    .select()
    .from(orgSettings)
    .orderBy(asc(orgSettings.createdAt))
    .limit(1);

  return row ?? null;
}

/**
 * Read the settings, creating them from the column defaults if they aren't
 * there yet.
 *
 * It self-seeds so that no part of the app ever has to cope with a null
 * settings object and nobody has to remember to run a seed script before the
 * first invoice. The defaults are the safe ones — not GST registered, so an
 * invoice raised before anyone visits this page prints no tax line, which is
 * correct for a business that isn't registered.
 */
async function ensureSettingsRow(): Promise<OrgSettingsRecord> {
  const existing = await selectSettingsRow();
  if (existing) return existing;

  try {
    // Every column has a default, so drizzle emits `values (default, …)` and
    // the row that lands is exactly the schema's idea of a new business.
    const [created] = await db.insert(orgSettings).values({}).returning();
    if (created) return created;
  } catch (error) {
    // Two first-load requests can reach the insert together. Rather than
    // guessing which failure mode the driver reports, fall through and re-read
    // — if the other request seeded the row, the select below finds it.
    console.error("[settings] seed insert failed, re-reading", error);
  }

  const seeded = await selectSettingsRow();
  if (seeded) return seeded;

  // Neither the insert nor either read produced a row: the database is not
  // reachable, and a caller printing an invoice needs to hear about that
  // rather than be handed a plausible-looking blank.
  throw new Error("SETTINGS_UNAVAILABLE");
}

/**
 * The public read.
 *
 * NO `requireSession()` here, on purpose. The public invoice view at
 * /invoice/[token] has to print KPVE's name, ABN and payment details for a
 * client who is not signed in, and this read exposes nothing that isn't
 * already on the bottom of an invoice or on the public website. The write
 * below is where the session check belongs.
 *
 * cache()d so several callers in one render (the invoice builder wants both
 * the identity and the tax settings) share one query, and so a first-load race
 * inside a single render can only insert once. `updateOrgSettings` pointedly
 * does NOT go through this — see the note there.
 */
export const getOrgSettings = cache(ensureSettingsRow);

/**
 * What `computeTax()` in lib/billing.ts wants, so no caller ever rebuilds this
 * object by hand and gets one field of it wrong.
 */
export async function getTaxSettings(): Promise<TaxSettings> {
  const settings = await getOrgSettings();

  return {
    gstRegistered: settings.gstRegistered,
    taxRateBps: settings.taxRateBps,
    pricesIncludeTax: settings.pricesIncludeTax,
  };
}

/**
 * Nullable columns take `null` to clear them, not `undefined` — the settings
 * form posts every field every time, so "blank" is a real instruction to empty
 * the field rather than an absent key. `undefined` still means "don't touch".
 */
export type OrgSettingsPatch = {
  legalName?: string;
  tradingName?: string | null;
  abn?: string | null;
  address?: string | null;
  email?: string;
  phone?: string | null;
  website?: string | null;
  gstRegistered?: boolean;
  taxRateBps?: number;
  pricesIncludeTax?: boolean;
  invoicePrefix?: string;
  paymentTermsDays?: number;
  invoiceFooter?: string | null;
  bankName?: string | null;
  bsb?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
};

const PATCHABLE = [
  "legalName",
  "tradingName",
  "abn",
  "address",
  "email",
  "phone",
  "website",
  "gstRegistered",
  "taxRateBps",
  "pricesIncludeTax",
  "invoicePrefix",
  "paymentTermsDays",
  "invoiceFooter",
  "bankName",
  "bsb",
  "accountName",
  "accountNumber",
] as const;

export async function updateOrgSettings(patch: OrgSettingsPatch): Promise<void> {
  const staff = await requireSession();

  // Read first: this resolves which row is authoritative and seeds one on a
  // database that has never had these settings saved. Deliberately the
  // uncached helper — a Server Action and the re-render it triggers share a
  // request, so memoising the pre-update row here risks the settings page
  // redrawing the values the user just replaced.
  const current = await ensureSettingsRow();

  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: staff.id };
  for (const key of PATCHABLE) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }

  const [updated] = await db
    .update(orgSettings)
    .set(set)
    .where(eq(orgSettings.id, current.id))
    .returning({ id: orgSettings.id });

  if (!updated) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "settings",
    entityId: current.id,
    action: "settings.updated",
    // Field names only. The values are KPVE's bank account, and an audit log
    // is a lower-trust surface than the settings page itself.
    metadata: { changed: Object.keys(patch) },
  });
}

/* ---------------------------------------------------------------------------
   Readiness

   The ATO wants a tax invoice to carry the seller's identity, ABN and address.
   Missing any of them and the document is a receipt, not something a client's
   accountant can file — so the settings page says which ones are still blank
   instead of letting the first invoice find out.
--------------------------------------------------------------------------- */

export type ReadinessItem = {
  field: keyof OrgSettingsRecord;
  label: string;
  hint: string;
  done: boolean;
};

/**
 * Pure, and exported, because the invoice screen has to raise the same warning
 * before it prints — the two must never disagree about what "ready" means.
 *
 * GST registration adds nothing to this list: the rate already has a default
 * and the tax line is computed, so a registered business with these three
 * fields filled in can issue a compliant invoice.
 */
export function invoiceReadiness(settings: OrgSettingsRecord): ReadinessItem[] {
  const filled = (value: string | null) => Boolean(value && value.trim());

  return [
    {
      field: "legalName",
      label: "Legal name",
      hint: "The entity the client is buying from.",
      done: filled(settings.legalName),
    },
    {
      field: "abn",
      label: "ABN",
      hint: "Without it the document is not a tax invoice.",
      done: filled(settings.abn),
    },
    {
      field: "address",
      label: "Business address",
      hint: "Printed under your name at the top.",
      done: filled(settings.address),
    },
  ];
}
