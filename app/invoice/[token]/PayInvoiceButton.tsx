"use client";

import { useActionState } from "react";

import { payInvoiceAction, type PaymentActionState } from "@/lib/actions/payments";

/* ---------------------------------------------------------------------------
   "Pay now" on the client's own copy of an invoice.

   It posts rather than links, because there is nothing to link TO until it is
   pressed: the Checkout Session is minted on the click and the action redirects
   into it. A Stripe session expires in 24 hours and an invoice does not, so a
   URL baked into the page when the invoice was sent would be dead by the time
   most clients get to it.

   The token in the hidden field is the only credential — the same thing that
   let them see the invoice at all.
--------------------------------------------------------------------------- */

const initialState: PaymentActionState = { ok: false, error: null };

export function PayInvoiceButton({
  token,
  label,
}: {
  token: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(payInvoiceAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending && (
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          />
        )}
        {pending ? "Opening secure checkout" : label}
      </button>

      {state.error && (
        <p role="alert" className="text-xs text-red-500">
          {state.error}
        </p>
      )}
    </form>
  );
}
