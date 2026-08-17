"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/dal/session";
import {
  createInvoiceFromServices,
  deleteInvoice,
  resyncDraftInvoice,
  setInvoiceDuration,
  setInvoiceStatus,
  updateInvoice,
} from "@/lib/dal/invoices";
import {
  createInvoiceSchema,
  setInvoiceDurationSchema,
  setInvoiceStatusSchema,
  updateInvoiceSchema,
} from "@/lib/validation";

export type InvoiceActionState = { ok: boolean; error: string | null };

const fail = (error: string): InvoiceActionState => ({ ok: false, error });

function mapError(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case "UNAUTHORIZED":
        return "Your session expired. Please sign in again.";
      case "NOT_FOUND":
        return "That record no longer exists.";
      case "NO_LINES":
        return "Pick at least one line to invoice.";
      case "MIXED_CURRENCY":
        return "Those lines are in different currencies — invoice one currency at a time.";
      case "BAD_TRANSITION":
        return "That status change isn't allowed from where this invoice is.";
      case "NOT_DRAFT":
        return "Only a draft invoice can be changed. Void it and reissue instead.";
      case "NUMBER_ALLOCATION_FAILED":
        return "Couldn't allocate an invoice number — try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

/* ---------------------------------------------------------------------------
   Create — from the "New invoice" builder on a client page. Lands on the draft.
--------------------------------------------------------------------------- */

export async function createInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const parsed = createInvoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    // Repeated checkbox fields — getAll, not get.
    clientServiceIds: formData.getAll("clientServiceIds"),
    coverMonths: formData.get("coverMonths") ?? undefined,
    issueDate: formData.get("issueDate") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    poNumber: formData.get("poNumber") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  let invoiceId: string;
  try {
    await requireSession();
    ({ id: invoiceId } = await createInvoiceFromServices({
      clientId: parsed.data.clientId,
      clientServiceIds: parsed.data.clientServiceIds,
      coverMonths: parsed.data.coverMonths,
      issueDate: parsed.data.issueDate,
      dueDate: parsed.data.dueDate,
      poNumber: parsed.data.poNumber,
      notes: parsed.data.notes,
    }));
  } catch (error) {
    console.error("[createInvoiceAction]", error);
    return fail(mapError(error));
  }

  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  revalidatePath("/admin/invoices");
  redirect(`/admin/invoices/${invoiceId}`);
}

/* ---------------------------------------------------------------------------
   Status — send, mark paid, void. One control, every transition the model allows.
--------------------------------------------------------------------------- */

export async function setInvoiceStatusAction(formData: FormData): Promise<void> {
  const parsed = setInvoiceStatusSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  try {
    await requireSession();
    const { clientId } = await setInvoiceStatus(parsed.data.invoiceId, parsed.data.status);
    revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[setInvoiceStatusAction]", error);
  }
}

/* ---------------------------------------------------------------------------
   Edit / delete — draft only, enforced in the DAL.
--------------------------------------------------------------------------- */

export async function updateInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const parsed = updateInvoiceSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    notes: formData.get("notes") ?? undefined,
    poNumber: formData.get("poNumber") ?? undefined,
    issueDate: formData.get("issueDate") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Those changes couldn't be saved.");
  }

  try {
    await requireSession();
    const { clientId } = await updateInvoice(parsed.data.invoiceId, {
      issueDate: parsed.data.issueDate,
      dueDate: parsed.data.dueDate,
      poNumber: parsed.data.poNumber,
      notes: parsed.data.notes,
    });
    revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[updateInvoiceAction]", error);
    return fail(mapError(error));
  }

  return { ok: true, error: null };
}

/* ---------------------------------------------------------------------------
   Duration — re-price a draft for a different span. "Make it two years."
--------------------------------------------------------------------------- */

export async function setInvoiceDurationAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const parsed = setInvoiceDurationSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    coverMonths: formData.get("coverMonths") ?? undefined,
  });

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That duration isn't valid.");
  }

  try {
    await requireSession();
    const { clientId } = await setInvoiceDuration(
      parsed.data.invoiceId,
      parsed.data.coverMonths ?? null,
    );
    revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[setInvoiceDurationAction]", error);
    return fail(mapError(error));
  }

  return { ok: true, error: null };
}

/* ---------------------------------------------------------------------------
   Re-snapshot — pull the current org identity, client billing profile and tax
   settings onto a draft. Draft only; the DAL enforces it.
--------------------------------------------------------------------------- */

export async function resyncInvoiceAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  try {
    await requireSession();
    const { clientId } = await resyncDraftInvoice(invoiceId);
    revalidatePath(`/admin/invoices/${invoiceId}`);
    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[resyncInvoiceAction]", error);
  }
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  let clientId: string;
  try {
    await requireSession();
    ({ clientId } = await deleteInvoice(invoiceId));
  } catch (error) {
    console.error("[deleteInvoiceAction]", error);
    redirect(`/admin/invoices/${invoiceId}`);
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/clients/${clientId}`);
  redirect("/admin/invoices");
}
