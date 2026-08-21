"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/dal/session";
import {
  createInvoiceFromServices,
  deleteInvoice,
  getInvoice,
  resyncDraftInvoice,
  setInvoiceDuration,
  setInvoiceStatus,
  updateInvoice,
} from "@/lib/dal/invoices";
import {
  billTermSchema,
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
      case "NOT_DELETABLE":
        return "A live invoice can't be deleted. Void it first, then delete it.";
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
   Edit / delete — edits are draft-only; delete also allows a void record.
   Both enforced in the DAL.
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
   Bill a term — one line, a fixed span, and a link to send. In one press.

   The thing staff actually want is not "an invoice object": it is a link they
   can paste to a client that collects two years now. Every extra step between
   the intent and that link is a step where the subscription link — which bills
   one cycle and repeats — looks like the easier answer, and it is the wrong
   answer. So this creates the invoice, ISSUES it, and returns the client's own
   link, which is the sendable artifact.

   Why that link and not a raw Stripe URL: a Stripe Checkout Session expires in
   24 hours. A link emailed on Monday is opened on Thursday. `/invoice/<token>`
   never expires, is the tax invoice the client needs anyway, and its Pay now
   mints the Stripe session at the moment they press it — for the full amount.

   It sends immediately, so the amount is confirmed in the UI BEFORE this runs.
   After it, the invoice is a document: the correction is void-and-reissue.
--------------------------------------------------------------------------- */

export type BillTermState = {
  ok: boolean;
  error: string | null;
  /** Present on success — everything the panel needs to show the link. */
  invoice?: {
    id: string;
    number: string;
    publicToken: string;
    totalCents: number;
    currency: string;
  };
};

export async function billTermAction(
  _prev: BillTermState,
  formData: FormData,
): Promise<BillTermState> {
  const parsed = billTermSchema.safeParse({
    clientId: formData.get("clientId"),
    clientServiceId: formData.get("clientServiceId"),
    coverMonths: formData.get("coverMonths") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the term and try again." };
  }

  try {
    await requireSession();

    const { id } = await createInvoiceFromServices({
      clientId: parsed.data.clientId,
      clientServiceIds: [parsed.data.clientServiceId],
      coverMonths: parsed.data.coverMonths,
    });

    // Issue it in the same breath. A draft's client link deliberately 404s —
    // handing back a link that doesn't work yet would be worse than no link.
    await setInvoiceStatus(id, "sent");

    const invoice = await getInvoice(id);
    if (!invoice) return { ok: false, error: "The invoice was created but couldn't be read back." };

    revalidatePath(`/admin/clients/${parsed.data.clientId}`);
    revalidatePath("/admin/invoices");

    return {
      ok: true,
      error: null,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        publicToken: invoice.publicToken,
        totalCents: invoice.totalCents,
        currency: invoice.currency,
      },
    };
  } catch (error) {
    console.error("[billTermAction]", error);
    return { ok: false, error: mapError(error) };
  }
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

/* Delete — draft or void only; the DAL is the one that decides that.

   `redirectTo` exists because this button now has two homes. Pressed on the
   invoice page there is no page left to return to, so it lands on the list;
   pressed on a client's Invoices card the row simply disappears and staff stay
   where they were working. Only same-site paths are honoured, so a crafted
   form can't turn a delete into an open redirect. */
export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const requested = String(formData.get("redirectTo") ?? "");
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : null;

  let clientId: string;
  try {
    await requireSession();
    ({ clientId } = await deleteInvoice(invoiceId));
  } catch (error) {
    console.error("[deleteInvoiceAction]", error);
    redirect(returnTo ?? `/admin/invoices/${invoiceId}`);
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(returnTo ?? "/admin/invoices");
}
