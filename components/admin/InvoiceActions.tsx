"use client";

import { useActionState, useState, type ReactNode } from "react";

import {
  deleteInvoiceAction,
  emailInvoiceAction,
  issueAndMarkPaidAction,
  issueInvoiceAndPreviewEmailAction,
  previewInvoiceEmailAction,
  resyncInvoiceAction,
  setInvoiceDurationAction,
  setInvoiceStatusAction,
  voidAndDeleteInvoiceAction,
  type InvoiceActionState,
} from "@/lib/actions/invoices";
import { EmailItControl } from "./EmailItControl";
import type { InvoiceStatus } from "@/lib/db/schema";
import { formatDuration } from "@/lib/billing";
import { AdminButton } from "./ui";
import {
  DurationBreakdown,
  DurationPicker,
  type DurationLine,
} from "./DurationPicker";

/* ---------------------------------------------------------------------------
   The invoice action bar — everything interactive about an invoice lives here,
   so InvoiceDocument can stay a pure, printable server component. The whole bar
   is `no-print`: it must never appear on the page the client files.

   Buttons reflect the status because the model does: draft is the only editable
   state; a sent invoice is void-and-reissue, not edit. Delete shows on every
   status, but a live one goes through the void first — one press that runs both
   steps, so the number is retired rather than pulled out of the sequence. The
   DAL enforces the same rules, so a stale button can't do anything the model
   forbids.
--------------------------------------------------------------------------- */

const primaryClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-medium text-[var(--admin-accent-fg)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]/50 disabled:pointer-events-none disabled:opacity-55";

const secondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--admin-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]/50";

export function InvoiceActions({
  status,
  invoiceId,
  publicToken,
  billToEmail,
  number,
  coverMonths,
  durationLines,
  staleFields = [],
}: {
  status: InvoiceStatus;
  invoiceId: string;
  publicToken: string;
  billToEmail: string | null;
  number: string;
  /** Months billed up front, or null for one cycle per line. */
  coverMonths: number | null;
  /** The invoice's lines, so a draft can be re-priced with its total in view. */
  durationLines: DurationLine[];
  /**
   * Plain-English names of the things that have changed in settings since this
   * draft was snapshotted — empty when the draft is current, and always empty
   * for an issued invoice, which is frozen by design.
   */
  staleFields?: string[];
}) {
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  // The PDF preview is the actual generated file, embedded — so staff see exactly
  // what the client downloads, not just the HTML approximation below it.
  const [previewing, setPreviewing] = useState(false);

  // The origin is only knowable in the browser; reading it during render would
  // mismatch the server HTML. So both share-actions build the absolute link at
  // click time — no origin state, no effect, no hydration hazard.
  const clientLink = () => `${window.location.origin}/invoice/${publicToken}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(clientLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins; the link is also on the page.
    }
  }

  const isStale = status === "draft" && staleFields.length > 0;

  return (
    <div className="no-print flex flex-col gap-3">
      {/* The invoice is a snapshot taken when it was created, so settings saved
          afterwards are simply not on it. Rather than leave staff to work that
          out from an invoice that inexplicably says nothing about GST, name what
          moved and offer the one-click fix. Send does this automatically too —
          this is for seeing the corrected draft before sending it. */}
      {isStale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-accent)]/40 bg-[var(--admin-surface-2)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--admin-fg)]">
              Settings have changed since this draft was created
            </p>
            <p className="mt-0.5 text-sm text-[var(--admin-fg-muted)]">
              Not yet on this invoice: {staleFields.join(", ")}.
            </p>
          </div>
          <form action={resyncInvoiceAction} className="inline-flex shrink-0">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <AdminButton type="submit">Update from settings</AdminButton>
          </form>
        </div>
      )}

      {/* Duration lives with the draft controls because it re-prices the
          document: it is an edit, and edits stop at "sent" like every other. */}
      {status === "draft" && (
        <DurationControl
          invoiceId={invoiceId}
          coverMonths={coverMonths}
          lines={durationLines}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Status-driven primary actions. */}
        {/* Issuing lives in the shared block below, so the email panel it opens
            isn't torn down the moment the status flips to "sent". Without an
            address there is nothing to email, so that case keeps a plain
            issue button. */}
        {status === "draft" && (
          <>
            {!billToEmail && (
              <StatusForm invoiceId={invoiceId} status="sent">
                <AdminButton type="submit">Issue invoice</AdminButton>
              </StatusForm>
            )}
            <DeleteControl
              invoiceId={invoiceId}
              label="Delete draft"
              confirming={confirmingDelete}
              onAsk={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
            />
          </>
        )}

        {status === "sent" && (
          <>
            <StatusForm invoiceId={invoiceId} status="paid">
              <AdminButton type="submit">Mark paid</AdminButton>
            </StatusForm>
            <VoidControl
              invoiceId={invoiceId}
              confirming={confirmingVoid}
              onAsk={() => setConfirmingVoid(true)}
              onCancel={() => setConfirmingVoid(false)}
            />
            <DeleteControl
              invoiceId={invoiceId}
              action={voidAndDeleteInvoiceAction}
              label="Delete"
              confirmLabel="Void and delete"
              confirming={confirmingDelete}
              onAsk={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
            />
          </>
        )}

        {status === "paid" && (
          <>
            <VoidControl
              invoiceId={invoiceId}
              confirming={confirmingVoid}
              onAsk={() => setConfirmingVoid(true)}
              onCancel={() => setConfirmingVoid(false)}
            />
            <DeleteControl
              invoiceId={invoiceId}
              action={voidAndDeleteInvoiceAction}
              label="Delete"
              confirmLabel="Void and delete"
              confirming={confirmingDelete}
              onAsk={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
            />
          </>
        )}

        {/* A void invoice is already closed: the client can't see it and it
            counts for nothing. Deleting it just takes the row off the list, so
            it's the one live-invoice tidy-up offered — and only from here, one
            deliberate step after the void. */}
        {status === "void" && (
          <DeleteControl
            invoiceId={invoiceId}
            label="Delete permanently"
            confirming={confirmingDelete}
            onAsk={() => setConfirmingDelete(true)}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}

        {/* Sharing + print — for every live state, but not for a void record. */}
        {status !== "void" && (
          <>
            {/* Rendered here, outside the status branches, and FIRST: React
                keeps a component's state only while it stays in the same
                position, and issuing flips the status underneath it. Inside a
                `status === "draft"` branch this control would unmount at the
                moment it had something to show. */}
            {billToEmail && (
              <EmailItControl
                previewAction={
                  status === "draft"
                    ? issueInvoiceAndPreviewEmailAction
                    : previewInvoiceEmailAction
                }
                sendAction={emailInvoiceAction}
                fields={{ invoiceId }}
                className={status === "draft" ? primaryClass : secondaryClass}
                label={status === "draft" ? "Issue & email" : "Email it"}
                cancelLabel={status === "draft" ? "Not yet" : "Cancel"}
                describes={`invoice ${number}`}
              />
            )}
            {/* Money that arrived on its own — a client whose subscription
                debits itself has already paid before this draft was written, so
                the invoice is a receipt and there is nothing to email. Issuing
                still happens underneath, so the number, the resync and the
                trail are the ones the two-press route would have left. Sits
                after the email control, never inside the draft branch, for the
                position reason above. */}
            {status === "draft" && (
              <form action={issueAndMarkPaidAction} className="inline-flex">
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <button type="submit" className={secondaryClass}>
                  Mark paid
                </button>
              </form>
            )}
            <button type="button" onClick={() => window.print()} className={secondaryClass}>
              Print
            </button>
            <button type="button" onClick={copyLink} className={secondaryClass}>
              {copied ? "Copied" : "Copy client link"}
            </button>

            {/* PDF controls pushed to the far right of the bar — ml-auto opens the
                gap so the document actions sit apart from send/share. */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewing((v) => !v)}
                className={secondaryClass}
                aria-expanded={previewing}
              >
                {previewing ? "Hide preview" : "Preview PDF"}
              </button>
              <a
                href={`/admin/invoices/${invoiceId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className={secondaryClass}
              >
                Download PDF
              </a>
            </div>
          </>
        )}
      </div>

      {/* The generated PDF, embedded on the page — exactly the file that
          downloads and that the client receives. */}
      {previewing && status !== "void" && (
        <iframe
          title={`Invoice ${number} — PDF preview`}
          src={`/admin/invoices/${invoiceId}/pdf`}
          className="h-[900px] w-full rounded-lg border border-[var(--admin-border)] bg-white"
        />
      )}

      {/* The rule, said once. Draft is the only editable state; after it's sent
          the document is a record, and a mistake is fixed by voiding and
          reissuing — which is how invoices work everywhere. */}
      <p className="text-xs text-[var(--admin-fg-subtle)]">
        {status === "draft"
          ? "This is a draft — edit or delete it freely. Issue & email makes the client link live and then offers the email; nothing reaches the client until you send that. Mark paid issues it and records it as settled in one step, for money that has already arrived — no email either way."
          : status === "void"
            ? "This invoice is void. A voided invoice is a closed record; raise a new one if needed, or delete it to take it off the list for good."
            : "A sent invoice can't be edited — only voided and reissued. Issuing is not emailing: press Email it to actually send it to the client."}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Duration — "actually, make it two years", after the draft already exists.

   Which it usually is. Deleting and rebuilding the invoice to answer it would
   burn an invoice number for a question, so a draft re-prices in place: every
   line is re-derived from its own unit price and cycle count, and the totals
   and GST follow. Draft only, enforced in the DAL, not here.
--------------------------------------------------------------------------- */

const durationInitial: InvoiceActionState = { ok: false, error: null };

function DurationControl({
  invoiceId,
  coverMonths,
  lines,
}: {
  invoiceId: string;
  coverMonths: number | null;
  lines: DurationLine[];
}) {
  const [state, formAction, pending] = useActionState(
    setInvoiceDurationAction,
    durationInitial,
  );
  const [months, setMonths] = useState<number | null>(coverMonths);

  // Nothing to apply until the picker differs from what's on the invoice — an
  // enabled "Apply" that would change nothing is a button that teaches people
  // the control does nothing.
  const dirty = months !== coverMonths;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-4 py-3"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="coverMonths" value={months ?? ""} />

      <div className="flex flex-wrap items-end gap-3">
        <DurationPicker id="invoice-duration" months={months} onChange={setMonths} />
        <AdminButton
          type="submit"
          variant={dirty ? "primary" : "secondary"}
          loading={pending}
          disabled={!dirty}
        >
          {pending ? "Re-pricing" : dirty ? "Apply new duration" : "Applied"}
        </AdminButton>
      </div>

      {/* What the invoice becomes if Apply is pressed — priced from the lines
          themselves, so it is the same arithmetic the DAL will run. */}
      {dirty && <DurationBreakdown lines={lines} months={months} />}

      <p className="text-xs text-[var(--admin-fg-subtle)]">
        {state.error ? (
          <span role="alert" className="text-red-500">
            {state.error}
          </span>
        ) : coverMonths ? (
          `Billing ${formatDuration(coverMonths)} up front. Changing it re-prices every line and its GST.`
        ) : (
          "One billing cycle per line. Pick a longer span to bill it up front."
        )}
      </p>
    </form>
  );
}

/** A plain status post — the DAL enforces which transitions are legal. */
function StatusForm({
  invoiceId,
  status,
  children,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  children: ReactNode;
}) {
  return (
    <form action={setInvoiceStatusAction} className="inline-flex">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="status" value={status} />
      {children}
    </form>
  );
}

/** Voiding is destructive and irreversible, so it always confirms first. */
function VoidControl({
  invoiceId,
  confirming,
  onAsk,
  onCancel,
}: {
  invoiceId: string;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
}) {
  if (!confirming) {
    return (
      <AdminButton type="button" variant="secondary" onClick={onAsk}>
        Void
      </AdminButton>
    );
  }
  return (
    <form action={setInvoiceStatusAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="status" value="void" />
      <AdminButton type="submit" variant="danger">
        Void this invoice
      </AdminButton>
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
      >
        Cancel
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------------------
   Delete — two presses, always. The second button says what it does rather than
   "Confirm", because the row it removes does not come back.
--------------------------------------------------------------------------- */

function DeleteControl({
  invoiceId,
  label,
  confirmLabel = "Delete permanently",
  action = deleteInvoiceAction,
  confirming,
  onAsk,
  onCancel,
  redirectTo,
}: {
  invoiceId: string;
  label: string;
  /** The second press, which names the act rather than saying "Confirm". */
  confirmLabel?: string;
  /**
   * Which removal runs. A draft or void record is deleted outright; a live one
   * is handed to the action that voids it first, because a number that just
   * disappears from the sequence is the thing an auditor asks about.
   */
  action?: (formData: FormData) => Promise<void>;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  /** Where to land afterwards. Defaults to the invoice list. */
  redirectTo?: string;
}) {
  if (!confirming) {
    return (
      <AdminButton type="button" variant="secondary" onClick={onAsk}>
        {label}
      </AdminButton>
    );
  }
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <AdminButton type="submit" variant="danger">
        {confirmLabel}
      </AdminButton>
      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
      >
        Cancel
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------------------
   A standalone print button — the public copy needs "Print / Save as PDF" too,
   and it's the same window.print() the client-facing spec asks for. Kept here so
   all the print/interactivity stays out of the server document.
--------------------------------------------------------------------------- */

export function PrintButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {children ?? "Print / Save as PDF"}
    </button>
  );
}
