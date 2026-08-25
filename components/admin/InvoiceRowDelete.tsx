"use client";

import { useState } from "react";

import { deleteInvoiceAction } from "@/lib/actions/invoices";

/* ---------------------------------------------------------------------------
   Row-level delete, shared by the invoice list and a client's Invoices card.

   Two presses, and the second one names the act — the row it removes does not
   come back. Deliberately quiet until asked: both lists are read far more often
   than they are pruned, so the first press is a muted word, not a red button.

   Which rows get one is the caller's business, but the answer is the same in
   both places and the DAL enforces it regardless: a draft isn't a document yet,
   and a void one is already a closed record. Sent and paid are voided first.

   `redirectTo` is where staff land afterwards — the list they were pruning,
   filters and all — so a delete never moves them off the page they were
   working on.
--------------------------------------------------------------------------- */

export function InvoiceRowDelete({
  invoiceId,
  redirectTo,
}: {
  invoiceId: string;
  redirectTo: string;
}) {
  const [confirming, setConfirming] = useState(false);

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
    <form action={deleteInvoiceAction} className="inline-flex shrink-0 items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button
        type="submit"
        className="whitespace-nowrap text-xs font-semibold text-red-500 transition hover:underline"
      >
        Delete for good
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
