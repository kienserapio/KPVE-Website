"use client";

import { useActionState } from "react";

import {
  disableAutopayAction,
  startAutopayAction,
  type PortalAutopayState,
} from "@/lib/actions/portal-autopay";
import { AUTOPAY_CONSENT_POINTS } from "@/lib/autopay/consent";
import type { PortalAutopayView } from "@/lib/dal/autopay";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The client's AutoPay controls.

   Two states, and the difference between them is the whole design:

     OFF — the terms, in full, above a box they have to tick. Nothing here is
           collapsed behind a "learn more": the consent record is only worth
           having if the words were actually in front of them.

     ON  — what card, what happens next, and a button that stops it. The off
           switch is never more than one press away and never asks staff,
           which is both the card networks' rule and the single best thing a
           business can do about disputes.
--------------------------------------------------------------------------- */

const initialState: PortalAutopayState = { error: null };

export function AutopayPanel({ autopay }: { autopay: PortalAutopayView }) {
  return autopay.enabled ? <AutopayOn autopay={autopay} /> : <AutopayOff autopay={autopay} />;
}

function AutopayOn({ autopay }: { autopay: PortalAutopayView }) {
  const [state, formAction, pending] = useActionState(disableAutopayAction, initialState);
  const card = autopay.card;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--svc-active-fg)]">AutoPay is on</p>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            We&rsquo;ll pay each invoice from your card on the day it falls due, and email you
            before and after.
          </p>
        </div>
        {autopay.simulated ? (
          <span className="shrink-0 rounded-full border border-[var(--admin-border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--admin-fg-subtle)]">
            Simulated
          </span>
        ) : null}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Paying with">
          {card ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span>{describeCard(card.brand, card.last4)}</span>
              {card.expMonth && card.expYear ? (
                <span className="text-xs text-[var(--admin-fg-subtle)]">
                  expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                </span>
              ) : null}
            </span>
          ) : (
            "No card saved"
          )}
        </Field>

        <Field label="Next payment">
          {autopay.next ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular-nums">
                {formatMoney(autopay.next.amountCents, autopay.next.currency)}
              </span>
              <span className="text-xs text-[var(--admin-fg-subtle)]">
                {autopay.next.number} ·{" "}
                {autopay.next.due
                  ? "due now, on the next run"
                  : autopay.next.dueDate
                    ? formatDate(autopay.next.dueDate)
                    : "no due date"}
              </span>
            </span>
          ) : (
            "Nothing outstanding"
          )}
        </Field>

        {autopay.lastChargeAt ? (
          <Field label="Last payment">{formatDate(autopay.lastChargeAt)}</Field>
        ) : null}
        {autopay.consentAt ? (
          <Field label="Turned on">{formatDate(autopay.consentAt)}</Field>
        ) : null}
      </dl>

      {card?.expired ? (
        <Notice tone="danger">
          That card has expired. Save a new one — until you do, invoices will need paying by
          hand.
        </Notice>
      ) : card?.expiringSoon ? (
        <Notice tone="warning">
          That card expires soon. Saving a new one now avoids a failed payment later.
        </Notice>
      ) : null}

      {autopay.needsAttention && autopay.lastFailureAt ? (
        <Notice tone="warning">
          The last attempt on {formatDate(autopay.lastFailureAt)}{" "}
          didn&rsquo;t go through. We emailed you a payment link and haven&rsquo;t retried the
          card.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--admin-border)] pt-5">
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-[var(--admin-border-strong)] px-3.5 py-2 text-xs font-medium text-[var(--admin-fg)] transition-colors hover:bg-[var(--admin-surface-2)] disabled:opacity-60"
          >
            {pending ? "Turning off" : "Turn AutoPay off"}
          </button>
        </form>

        <ChangeCardButton label="Use a different card" />

        {state.error ? (
          <span role="alert" className="text-xs text-red-500">
            {state.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AutopayOff({ autopay }: { autopay: PortalAutopayView }) {
  const [state, formAction, pending] = useActionState(startAutopayAction, initialState);
  const hasCard = autopay.card !== null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--admin-fg)]">
            {hasCard ? "AutoPay is off" : "Pay your invoices automatically"}
          </p>
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">
            {hasCard
              ? "Your card is still saved. Turn AutoPay back on and we'll use it again."
              : "Save a card once and we'll pay each invoice on the day it falls due, so nothing goes overdue by accident."}
          </p>
        </div>
        {autopay.simulated ? (
          <span className="shrink-0 rounded-full border border-[var(--admin-border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--admin-fg-subtle)]">
            Simulated
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2 rounded-lg bg-[var(--admin-surface-2)] p-4">
        {AUTOPAY_CONSENT_POINTS.map((point) => (
          <li
            key={point}
            className="flex gap-2.5 text-sm leading-relaxed text-[var(--admin-fg-muted)]"
          >
            <span aria-hidden className="text-[var(--admin-accent)]">
              &middot;
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--admin-fg)]">
        <input
          type="checkbox"
          name="consent"
          className="mt-0.5 size-4 shrink-0 accent-[var(--admin-accent)]"
        />
        <span>I agree to the above, and authorise KPVE to charge my card for these invoices.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--admin-accent)] px-4 py-2.5 text-xs font-semibold text-[var(--admin-accent-fg,#111)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Opening" : hasCard ? "Turn AutoPay on" : "Save a card and turn it on"}
        </button>

        <span className="text-xs text-[var(--admin-fg-subtle)]">
          {autopay.simulated
            ? "Simulated — no real card details are collected."
            : "Card details are entered on Stripe's page. We never see or store them."}
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Changing the card is the same flow as turning it on — a new setup session
 * that replaces the stored one — so the consent has already been given and the
 * box is not shown again. The hidden field carries it.
 */
function ChangeCardButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(startAutopayAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="consent" value="on" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-[var(--admin-border-strong)] px-3.5 py-2 text-xs font-medium text-[var(--admin-fg)] transition-colors hover:bg-[var(--admin-surface-2)] disabled:opacity-60"
      >
        {pending ? "Opening" : label}
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-red-500">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--admin-fg)]">{children}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "danger"; children: React.ReactNode }) {
  const color = tone === "danger" ? "var(--pr-high-fg)" : "var(--svc-pending-fg)";

  return (
    <p
      className="rounded-lg px-3.5 py-3 text-sm leading-relaxed"
      style={{
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </p>
  );
}

/** Stripe reports brands lowercase ("visa"); nobody writes it that way. */
export function describeCard(brand: string | null, last4: string | null): string {
  if (!last4) return "Card saved";
  const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  return `${name} ending ${last4}`;
}
