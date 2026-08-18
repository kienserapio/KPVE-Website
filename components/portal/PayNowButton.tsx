"use client";

import { useActionState, useState } from "react";

import {
  payPortalInvoiceAction,
  type PortalPayState,
} from "@/lib/actions/portal-billing";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   "Pay now", from inside the portal.

   Two steps, for the same reason the emailed invoice's button has two: the
   second panel is a receipt-before-the-fact. The exact amount, what it covers,
   and that it is a single charge — all said HERE, on a page the client already
   trusts, rather than discovered after a redirect to Stripe. Someone paying
   $1,056 against a service they know costs $44 a month should meet that number
   while they can still stop.

   The only thing that travels is the invoice id, and it is worthless on its
   own: the action re-reads the invoice scoped to the session's own client, so
   a pasted id from someone else's account resolves to nothing.
--------------------------------------------------------------------------- */

const initialState: PortalPayState = { error: null };

export function PayNowButton({
  invoiceId,
  number,
  /** The BALANCE, not the total — a part-paid invoice never re-asks for it all. */
  amountCents,
  currency,
  dueDate,
  coverStart,
  coverEnd,
  partPaid,
  size = "default",
  className,
}: {
  invoiceId: string;
  number: string;
  amountCents: number;
  currency: string;
  dueDate?: Date | null;
  coverStart?: Date | null;
  coverEnd?: Date | null;
  partPaid?: boolean;
  size?: "default" | "small";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(
    payPortalInvoiceAction,
    initialState,
  );
  const [reviewing, setReviewing] = useState(false);

  if (!reviewing) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className={cn(
            "inline-flex items-center justify-center rounded-lg bg-[var(--admin-accent)] font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110",
            size === "small" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm",
          )}
        >
          Pay {formatMoney(amountCents, currency)}
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
      className={cn(
        "w-full max-w-sm rounded-xl border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] p-4 text-left shadow-[var(--admin-shadow)]",
        className,
      )}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />

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
        {dueDate && <Row label="Due" value={formatDate(dueDate)} />}
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
