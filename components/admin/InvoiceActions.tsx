"use client";

import { useState, type ReactNode } from "react";

import {
  deleteInvoiceAction,
  setInvoiceStatusAction,
} from "@/lib/actions/invoices";
import type { InvoiceStatus } from "@/lib/db/schema";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import { AdminButton } from "./ui";

/* ---------------------------------------------------------------------------
   The invoice action bar — everything interactive about an invoice lives here,
   so InvoiceDocument can stay a pure, printable server component. The whole bar
   is `no-print`: it must never appear on the page the client files.

   Buttons reflect the status because the model does: draft is the only editable,
   deletable state; a sent invoice is void-and-reissue, not edit. The DAL enforces
   the same transitions, so a stale button can't do anything the model forbids.
--------------------------------------------------------------------------- */

const secondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--admin-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]/50";

export function InvoiceActions({
  status,
  invoiceId,
  publicToken,
  billToEmail,
  number,
  totalCents,
  currency,
  dueDate,
}: {
  status: InvoiceStatus;
  invoiceId: string;
  publicToken: string;
  billToEmail: string | null;
  number: string;
  totalCents: number;
  currency: string;
  dueDate: Date | null;
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

  function emailIt() {
    if (!billToEmail) return;
    const dueLabel = dueDate ? formatDate(dueDate) : null;
    const body =
      `Hi,\n\n` +
      `Here's invoice ${number} for ${formatMoney(totalCents, currency)}` +
      `${dueLabel ? `, due ${dueLabel}` : ""}.\n\n` +
      `View and pay it here:\n${clientLink()}\n\n` +
      `Thanks,\nKPVE`;
    window.location.href =
      `mailto:${encodeURIComponent(billToEmail)}` +
      `?subject=${encodeURIComponent(`Invoice ${number}`)}` +
      `&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="no-print flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Status-driven primary actions. */}
        {status === "draft" && (
          <>
            <StatusForm invoiceId={invoiceId} status="sent">
              <AdminButton type="submit">Send</AdminButton>
            </StatusForm>
            {confirmingDelete ? (
              <form action={deleteInvoiceAction} className="inline-flex items-center gap-2">
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <AdminButton type="submit" variant="danger">
                  Delete permanently
                </AdminButton>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete draft
              </AdminButton>
            )}
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
          </>
        )}

        {status === "paid" && (
          <VoidControl
            invoiceId={invoiceId}
            confirming={confirmingVoid}
            onAsk={() => setConfirmingVoid(true)}
            onCancel={() => setConfirmingVoid(false)}
          />
        )}

        {/* Sharing + print — for every live state, but not for a void record. */}
        {status !== "void" && (
          <>
            <button type="button" onClick={() => window.print()} className={secondaryClass}>
              Print
            </button>
            <button type="button" onClick={copyLink} className={secondaryClass}>
              {copied ? "Copied" : "Copy client link"}
            </button>
            {billToEmail && (
              <button type="button" onClick={emailIt} className={secondaryClass}>
                Email it
              </button>
            )}

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
          ? "This is a draft — edit or delete it freely. The client link goes live once you send it."
          : status === "void"
            ? "This invoice is void. A voided invoice is a closed record; raise a new one if needed."
            : "A sent invoice can't be edited — only voided and reissued."}
      </p>
    </div>
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
