"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/dal/session";
import { logActivity } from "@/lib/dal/activity";
import { sendMail } from "@/lib/email";
import { invoiceEmail, type Email } from "@/lib/email/templates";
import type { EmailFlowState } from "@/lib/email/flow";
import { appUrl, formatDate } from "@/lib/utils";
import {
  createInvoiceFromServices,
  deleteInvoice,
  getInvoice,
  issueAndMarkInvoicePaid,
  resyncDraftInvoice,
  setInvoiceDuration,
  setInvoiceStatus,
  updateInvoice,
  voidAndDeleteInvoice,
  type InvoiceDetail,
} from "@/lib/dal/invoices";
import {
  billTermSchema,
  createInvoiceSchema,
  invoiceIdSchema,
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

/* Mark paid straight from a draft — for money that has already arrived.

   A client on an automatic monthly debit has paid before the invoice is even
   written, so the document is a receipt, not a request. The DAL still walks it
   through "sent" on the way, so the resync-at-issue rule and the audit trail
   are the ones the two-press route would have produced. */
export async function issueAndMarkPaidAction(formData: FormData): Promise<void> {
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formData.get("invoiceId") });
  if (!parsed.success) return;

  try {
    await requireSession();
    const { clientId } = await issueAndMarkInvoicePaid(parsed.data.invoiceId);
    revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/admin/invoices");
    revalidatePath(`/admin/clients/${clientId}`);
  } catch (error) {
    console.error("[issueAndMarkPaidAction]", error);
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
  return removeInvoice(formData, deleteInvoice, "deleteInvoiceAction");
}

/* Void and delete — for a sent or paid invoice, which deleteInvoiceAction
   refuses outright.

   The rule it enforces hasn't moved: a live invoice is still voided before it
   is removed. This just stops making staff walk the two steps by hand across
   four page-loads, which is what pruning a run of test invoices actually costs.
   The DAL runs both, and logs both, so the audit trail is the one the manual
   route would have left. */
export async function voidAndDeleteInvoiceAction(formData: FormData): Promise<void> {
  return removeInvoice(formData, voidAndDeleteInvoice, "voidAndDeleteInvoiceAction");
}

/* The half both share: read the id, sanitise the return path, run the removal,
   then revalidate the two lists an invoice appears on before landing. */
async function removeInvoice(
  formData: FormData,
  remove: (id: string) => Promise<{ clientId: string }>,
  label: string,
): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const requested = String(formData.get("redirectTo") ?? "");
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : null;

  let clientId: string;
  try {
    await requireSession();
    ({ clientId } = await remove(invoiceId));
  } catch (error) {
    console.error(`[${label}]`, error);
    redirect(returnTo ?? `/admin/invoices/${invoiceId}`);
  }

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(returnTo ?? "/admin/invoices");
}

/* ---------------------------------------------------------------------------
   Email it — the invoice, sent by the app rather than by the staff member.

   This used to be a mailto: link: it opened whatever mail client the machine
   had, pre-filled a plain-text note and left a human to press Send. That made
   the invoice look like whatever that client's default font is, arrived from a
   personal mailbox, and could not be sent at all from a machine with no mail
   client configured. Now the server composes the document — lines, totals, GST
   and both ways to pay — and sends it over SMTP.

   Same contract as the portal code email: this never throws and never rolls
   anything back. Nothing about the invoice changes here; the mail either left
   or it didn't, and the UI says which. When SMTP isn't configured the answer is
   `not_configured`, which is a different sentence from "it failed" and the bar
   offers the old mailto: hand-off in its place.
--------------------------------------------------------------------------- */

/** The shared two-step shape — see lib/email/flow.ts. */
export type InvoiceEmailState = EmailFlowState;

/**
 * Read the invoice and build its mail. Shared by the preview and the send so
 * the two cannot drift: what was approved on screen is what goes out.
 *
 * Returns a refusal instead of the mail when the invoice can't be emailed at
 * all, so both entry points give the same answer to the same question.
 */
async function composeInvoiceEmail(
  invoiceId: string,
): Promise<{ error: string } | { to: string; mail: Email; invoice: InvoiceDetail }> {
  const invoice = await getInvoice(invoiceId);

  if (!invoice) return { error: "That invoice no longer exists." };

  // A draft has no live client link — getInvoiceByToken refuses one — so
  // emailing it would send a URL that 404s. Send it first, then email it.
  if (invoice.status === "draft") {
    return { error: "Send the invoice first — a draft has no client link yet." };
  }
  if (invoice.status === "void") {
    return { error: "A voided invoice can't be emailed. Raise a new one instead." };
  }
  if (!invoice.billToEmail) {
    return { error: "No billing email on this invoice. Add one to the client first." };
  }

  const mail = invoiceEmail({
    clientName: invoice.billToName,
    number: invoice.number,
    status: invoice.status,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    amountPaidCents: invoice.amountPaidCents,
    taxRateBps: invoice.taxRateBps,
    taxMode: invoice.taxMode,
    poNumber: invoice.poNumber,
    notes: invoice.notes,
    lines: invoice.lines.map((line) => ({
      label: line.label,
      period: periodLabel(line.periodStart, line.periodEnd),
      // The note staff wrote on the billing line, snapshotted at issue.
      description: line.description,
      // Same split the document does — newline-separated, blanks dropped.
      items: line.details
        ? line.details.split("\n").filter((item) => item.trim())
        : [],
      amountCents: line.amountCents,
    })),
    payUrl: `${appUrl()}/invoice/${invoice.publicToken}`,
    payable: invoice.payable,
    bankDetails: {
      bankName: invoice.bankDetails.bankName,
      bsb: invoice.bankDetails.bsb,
      accountName: invoice.bankDetails.accountName,
      accountNumber: invoice.bankDetails.accountNumber,
    },
  });

  return { to: invoice.billToEmail, mail, invoice };
}

/**
 * Issue a draft, then hand back its email for approval — one press.
 *
 * "Send" used to mean only "move this from draft to sent", which makes the
 * client link live and is a real and necessary step. It also read, to every
 * staff member who ever pressed it, as "send this to the client" — and it has
 * never emailed anybody. Invoices were issued, marked paid, and the client
 * heard nothing.
 *
 * So issuing now ends where staff already thought it ended: at the email, with
 * the mail on screen waiting for a second press. Cancelling leaves the invoice
 * issued and unsent, which is a legitimate place to stop — the panel says so
 * rather than implying the client has been told.
 */
export async function issueInvoiceAndPreviewEmailAction(
  _prev: InvoiceEmailState,
  formData: FormData,
): Promise<InvoiceEmailState> {
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formData.get("invoiceId") });
  if (!parsed.success) return fail("That invoice couldn't be found.");

  try {
    await requireSession();
    const current = await getInvoice(parsed.data.invoiceId);
    if (!current) return fail("That invoice no longer exists.");

    // Only a draft needs issuing. A second press — or a stale button — must not
    // try to re-issue something already sent, so this is a no-op by then.
    if (current.status === "draft") {
      const { clientId } = await setInvoiceStatus(parsed.data.invoiceId, "sent");
      revalidatePath(`/admin/invoices/${parsed.data.invoiceId}`);
      revalidatePath("/admin/invoices");
      revalidatePath(`/admin/clients/${clientId}`);
    }

    // Re-read: issuing resyncs a stale draft, so the mail must be built from
    // what the invoice became, not from what it was a moment ago.
    const built = await composeInvoiceEmail(parsed.data.invoiceId);
    if ("error" in built) return fail(built.error);

    return {
      ok: true,
      error: null,
      preview: { to: built.to, subject: built.mail.subject, html: built.mail.html },
    };
  } catch (error) {
    console.error("[issueInvoiceAndPreviewEmailAction]", error);
    return fail(mapError(error));
  }
}

/** Render it and hand it back. Sends nothing — this is the confirm step. */
export async function previewInvoiceEmailAction(
  _prev: InvoiceEmailState,
  formData: FormData,
): Promise<InvoiceEmailState> {
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formData.get("invoiceId") });
  if (!parsed.success) return fail("That invoice couldn't be found.");

  try {
    await requireSession();
    const built = await composeInvoiceEmail(parsed.data.invoiceId);
    if ("error" in built) return fail(built.error);

    return {
      ok: true,
      error: null,
      preview: { to: built.to, subject: built.mail.subject, html: built.mail.html },
    };
  } catch (error) {
    console.error("[previewInvoiceEmailAction]", error);
    return fail(mapError(error));
  }
}

export async function emailInvoiceAction(
  _prev: InvoiceEmailState,
  formData: FormData,
): Promise<InvoiceEmailState> {
  const parsed = invoiceIdSchema.safeParse({ invoiceId: formData.get("invoiceId") });

  if (!parsed.success) return fail("That invoice couldn't be found.");

  try {
    await requireSession();
    const built = await composeInvoiceEmail(parsed.data.invoiceId);
    if ("error" in built) return fail(built.error);

    const { to, mail, invoice } = built;

    const result = await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      // Replies go to the business, not to the outgoing mailbox — "if anything
      // looks wrong, reply to this email" is only true if someone reads it.
      replyTo: invoice.sellerEmail ?? undefined,
    });

    if (!result.sent) {
      return { ok: false, error: null, delivery: { sent: false, to, reason: result.reason } };
    }

    await logActivity({
      actorType: "staff",
      entityType: "invoice",
      entityId: invoice.id,
      action: "invoice.emailed",
      metadata: { number: invoice.number, to },
    });

    return { ok: true, error: null, delivery: { sent: true, to } };
  } catch (error) {
    console.error("[emailInvoiceAction]", error);
    return fail(mapError(error));
  }
}

/** Same rule the document and the PDF use — see InvoiceDocument. */
function periodLabel(start: Date | null, end: Date | null): string | null {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return formatDate(start);
  if (end) return formatDate(end);
  return null;
}
