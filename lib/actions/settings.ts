"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dal/session";
import { updateOrgSettings } from "@/lib/dal/settings";
import { orgSettingsSchema } from "@/lib/validation";

export type SettingsActionState = { ok: boolean; error: string | null };

const fail = (error: string): SettingsActionState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return "Your session expired. Please sign in again.";
  }
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return "That record no longer exists.";
  }
  if (error instanceof Error && error.message === "SETTINGS_UNAVAILABLE") {
    return "Couldn't reach the settings. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Optional text columns: a cleared box has to actually clear the column.
 * `emptyToUndefined` in the schema hands back "" for a blank field, and storing
 * "" would make an empty trading name print as an empty line on an invoice
 * rather than being skipped. null is the only honest "there isn't one".
 */
const orNull = (value: string | undefined): string | null =>
  value && value.trim() ? value : null;

export async function updateOrgSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = orgSettingsSchema.safeParse({
    legalName: formData.get("legalName"),
    tradingName: formData.get("tradingName") ?? undefined,
    abn: formData.get("abn") ?? undefined,
    address: formData.get("address") ?? undefined,
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    website: formData.get("website") ?? undefined,

    // Checkboxes post "on" or nothing; the radio pair posts "true"/"false".
    gstRegistered: formData.get("gstRegistered"),
    // Staff type a percent — the schema turns "10" into 1000 basis points.
    taxRateBps: formData.get("taxRatePercent") ?? undefined,
    pricesIncludeTax: formData.get("pricesIncludeTax"),

    invoicePrefix: formData.get("invoicePrefix"),
    // "" means "the usual 14 days"; null would coerce to 0 — due on receipt —
    // which is not what a missing field is asking for.
    paymentTermsDays: formData.get("paymentTermsDays") ?? "",
    invoiceFooter: formData.get("invoiceFooter") ?? undefined,
    bankName: formData.get("bankName") ?? undefined,
    bsb: formData.get("bsb") ?? undefined,
    accountName: formData.get("accountName") ?? undefined,
    accountNumber: formData.get("accountNumber") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const data = parsed.data;

  try {
    await requireSession();
    await updateOrgSettings({
      legalName: data.legalName,
      tradingName: orNull(data.tradingName),
      abn: orNull(data.abn),
      address: orNull(data.address),
      email: data.email,
      phone: orNull(data.phone),
      website: orNull(data.website),

      gstRegistered: data.gstRegistered,
      taxRateBps: data.taxRateBps,
      pricesIncludeTax: data.pricesIncludeTax,

      invoicePrefix: data.invoicePrefix,
      paymentTermsDays: data.paymentTermsDays,
      invoiceFooter: orNull(data.invoiceFooter),
      bankName: orNull(data.bankName),
      bsb: orNull(data.bsb),
      accountName: orNull(data.accountName),
      accountNumber: orNull(data.accountNumber),
    });
  } catch (error) {
    console.error("[updateOrgSettingsAction]", error);
    return fail(mapError(error));
  }

  revalidatePath("/admin/settings");
  return { ok: true, error: null };
}
