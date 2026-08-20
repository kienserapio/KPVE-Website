"use server";

import { revalidatePath } from "next/cache";

import { disableClientAutopay, setAutopayMasterSwitch } from "@/lib/dal/autopay";

/* ---------------------------------------------------------------------------
   Staff-side AutoPay. One action, one direction.

   There is no "turn it on". Consent to store and charge a card has to come from
   the person whose card it is — a CRM button that could manufacture that
   consent would make the record in `client_autopay.consent_*` worth nothing,
   which is the record we would produce if a charge were ever disputed.

   Stateful rather than fire-and-forget, unlike unlockPortalAccessAction: this
   is the one whose silent failure would be believed. Staff press "Turn off"
   because a client rang up and asked, nothing happens, and they say "done".
--------------------------------------------------------------------------- */

export type StaffAutopayState = { ok: boolean; error: string | null };

export async function disableClientAutopayAction(
  _prev: StaffAutopayState,
  formData: FormData,
): Promise<StaffAutopayState> {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) return { ok: false, error: "That client couldn't be found." };

  try {
    await disableClientAutopay(clientId);
  } catch (error) {
    console.error("[disableClientAutopayAction]", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, error: "This client has never set up AutoPay." };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true, error: null };
}

/**
 * The master switch on /admin/settings.
 *
 * Stateful for the same reason as the one above, and more so: a staff member
 * pressing "Pause AutoPay" because something looks wrong needs to know it
 * actually paused.
 */
export async function setAutopayEnabledAction(
  _prev: StaffAutopayState,
  formData: FormData,
): Promise<StaffAutopayState> {
  const enabled = formData.get("enabled") === "true";

  try {
    await setAutopayMasterSwitch(enabled);
  } catch (error) {
    console.error("[setAutopayEnabledAction]", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/settings");
  return { ok: true, error: null };
}
