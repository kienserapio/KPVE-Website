"use client";

import { useState } from "react";

import { deleteInvoiceAction, voidAndDeleteInvoiceAction } from "@/lib/actions/invoices";
import type { InvoiceStatus } from "@/lib/db/schema";

/* ---------------------------------------------------------------------------
   Row-level delete, shared by the invoice list and a client's Invoices card.

   Two presses, and the second one names the act — the row it removes does not
   come back. Deliberately quiet until asked: both lists are read far more often
   than they are pruned, so the first press is a muted word, not a red button.

   Every status gets one, but not the same one, because the model still draws
   the line where it always did:

     draft, void  → deleted outright. A draft was never a document; a void one
                    is already a closed record the client cannot see.
     sent, paid   → voided first, then deleted, in that order and in one press.
                    The number is retired the way an auditor expects rather than
                    vanishing mid-sequence, and the second button says so.

   The DAL enforces both routes regardless of which button is on screen, so a
   stale row can't delete a live invoice by posting the wrong form.

   `redirectTo` is where staff land afterwards — the list they were pruning,
   filters and all — so a delete never moves them off the page they were
   working on.
--------------------------------------------------------------------------- */

export function InvoiceRowDelete({
  invoiceId,
  status,
  redirectTo,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  redirectTo: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const live = status === "sent" || status === "paid";

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs font-medium text-[var(--admin-fg-subtle)] transition hover:text-red-500"
      >
        Delete
      </button>
    );
  }

  return (
    <form
      action={live ? voidAndDeleteInvoiceAction : deleteInvoiceAction}
      className="inline-flex shrink-0 items-center gap-2"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="whitespace-nowrap text-xs font-semibold text-red-500 transition hover:underline"
      >
        {live ? "Void and delete" : "Delete for good"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
      >
        Cancel
      </button>
    </form>
  );
}
