"use client";

import { useActionState, useState } from "react";

import { payInvoiceAction, type PaymentActionState } from "@/lib/actions/payments";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   "Pay now" on the client's own copy of an invoice.

   Two steps on purpose. The second one is a receipt-before-the-fact: the exact
   amount, what period it covers, and that it is a single payment — all of it
   said HERE, on a page the client already trusts, rather than left to be
   discovered on Stripe's. Someone paying $1,056 against a service they know
   costs $44 a month should meet that number while they can still stop, not
   after a redirect.

   The button posts rather than links, because there is nothing to link TO until
   it is pressed: the Checkout Session is minted on submit and the action
   redirects into it. A Stripe session expires in 24 hours and an invoice does
   not, so a URL baked into the page at send time would be dead before most
   clients reached it.

   The token in the hidden field is the only credential — the same thing that
   let them see the invoice at all.
--------------------------------------------------------------------------- */

const initialState: PaymentActionState = { ok: false, error: null };

export function PayInvoiceButton({
  token,
  number,
  amountCents,
  currency,
  coverStart,
  coverEnd,
  partPaid,
}: {
  token: string;
  number: string;
  /** The BALANCE, not the total — a part-paid invoice never re-asks for it all. */
  amountCents: number;
  currency: string;
  coverStart: Date | null;
  coverEnd: Date | null;
  /** True when something has already been paid against this invoice. */
  partPaid: boolean;
}) {
  const [state, formAction, pending] = useActionState(payInvoiceAction, initialState);
  const [reviewing, setReviewing] = useState(false);

  if (!reviewing) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110"
        >
          Pay now {formatMoney(amountCents, currency)}
        </button>
        {state.error && (
          <p role="alert" className="text-xs text-red-500">
            {state.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-sm rounded-xl border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] p-4 text-left shadow-[var(--admin-shadow)]"
    >
      <input type="hidden" name="token" value={token} />

      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {partPaid ? "Balance to pay" : "You're about to pay"}
      </p>

      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--admin-fg)]">
        {formatMoney(amountCents, currency, { alwaysCents: true })}
        <span className="ml-2 text-sm font-normal text-[var(--admin-fg-muted)]">
          {currency}
        </span>
      </p>

      <dl className="mt-3 flex flex-col gap-1.5 border-t border-[var(--admin-border)] pt-3 text-sm">
        <Row label="Invoice" value={number} />
        {coverStart && coverEnd && (
          <Row
            label="Covers"
            value={`${formatDate(coverStart)} – ${formatDate(coverEnd)}`}
          />
        )}
        <Row label="Payment" value="One payment, charged now" />
      </dl>

      <p className="mt-3 text-xs text-[var(--admin-fg-muted)]">
        The next screen is Stripe&apos;s secure checkout. Card details go to them,
        never to us — and nothing is charged until you confirm there.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--admin-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
        >
          {pending && (
            <span
              aria-hidden
              className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
            />
          )}
          {pending ? "Opening checkout" : "Continue to secure checkout"}
        </button>
        <button
          type="button"
          onClick={() => setReviewing(false)}
          disabled={pending}
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)] disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--admin-fg)]">{value}</dd>
    </div>
  );
}
