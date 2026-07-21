"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/dal/session";
import { updateLead, deleteLead } from "@/lib/dal/leads";
import { updateLeadSchema } from "@/lib/validation";

export type LeadActionState = { ok: boolean; error: string | null };

/**
 * Server Actions are reachable by direct POST, not only through our UI, and
 * proxy.ts does not cover them. Every action authorizes for itself — that is
 * what requireSession() inside the DAL is doing on each call below.
 */
export async function updateLeadAction(
  _prevState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const parsed = updateLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    status: formData.get("status") || undefined,
    internalNotes: formData.get("internalNotes") ?? undefined,
    assignedStaffId: formData.get("assignedStaffId") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "Those changes couldn't be saved. Check the form." };
  }

  const { leadId, ...patch } = parsed.data;

  try {
    await requireSession();
    await updateLead(leadId, patch);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, error: "That lead no longer exists." };
    }
    console.error("[updateLeadAction]", error);
    return { ok: false, error: "Something went wrong saving your changes." };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/leads/${leadId}`);
  return { ok: true, error: null };
}

export async function deleteLeadAction(
  _prevState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return { ok: false, error: "Missing lead." };

  try {
    await requireSession();
    await deleteLead(leadId);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Your session expired. Please sign in again." };
    }
    console.error("[deleteLeadAction]", error);
    return { ok: false, error: "Couldn't delete that lead." };
  }

  revalidatePath("/admin");
  return { ok: true, error: null };
}

export async function setThemeAction(theme: "light" | "dark"): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set("kpve_theme", theme === "light" ? "light" : "dark", {
    httpOnly: false, // purely cosmetic; no security value in hiding it
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/admin", "layout");
}
