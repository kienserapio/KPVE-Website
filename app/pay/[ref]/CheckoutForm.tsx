"use client";

import { useActionState } from "react";

import {
  simulatePaymentAction,
  type PaymentActionState,
} from "@/lib/actions/payments";

const initialState: PaymentActionState = { ok: false, error: null };

/**
 * The button on the simulated checkout. It posts to the same code path a real
 * Stripe webhook takes, so what happens after "Pay" here is what happens after
 * a real card clears — the service goes active, the bill date rolls and the
 * payment is written to the ledger.
 */
export function CheckoutForm({ paymentRef }: { paymentRef: string }) {
  const [state, formAction, pending] = useActionState(simulatePaymentAction, initialState);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
        <p className="font-medium text-success">Payment received</p>
        <p className="mt-1 text-sm text-muted-3">
          Thanks — you&apos;ll get a confirmation by email. Nothing else to do.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="ref" value={paymentRef} />

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-bright px-5 py-3.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending && (
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          />
        )}
        {pending ? "Processing" : "Pay now"}
      </button>

      {state.error && (
        <p role="alert" className="text-center text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
