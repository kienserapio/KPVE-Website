"use client";

import { useActionState } from "react";

import {
  disableClientAutopayAction,
  type StaffAutopayState,
} from "@/lib/actions/autopay";
import type { StaffAutopayView } from "@/lib/dal/autopay";
import { formatDate } from "@/lib/utils";
import { AdminButton } from "./ui";

/* ---------------------------------------------------------------------------
   What staff can see and do about a client's AutoPay.

   Read-mostly on purpose. The one control is an off switch — see
   lib/actions/autopay.ts for why there is no matching on switch — and the rest
   of the card exists to answer the two questions a client's phone call starts
   with: is it on, and what happened last time.
--------------------------------------------------------------------------- */

const initialState: StaffAutopayState = { ok: false, error: null };

export function ClientAutopay({
  clientId,
  autopay,
}: {
  clientId: string;
  autopay: StaffAutopayView;
}) {
  const [state, formAction, pending] = useActionState(
    disableClientAutopayAction,
    initialState,
  );

  if (!autopay.exists) {
    return (
      <p className="text-sm text-[var(--admin-fg-muted)]">
        This client hasn&rsquo;t set up AutoPay. Only they can turn it on — it&rsquo;s on
        their <span className="text-[var(--admin-fg)]">AutoPay</span> page in the portal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={
            autopay.enabled
              ? {
                  color: "var(--svc-active-fg)",
                  background: "color-mix(in srgb, var(--svc-active-fg) 12%, transparent)",
                }
              : {
                  color: "var(--admin-fg-subtle)",
                  background: "var(--admin-surface-2)",
                }
          }
        >
          {autopay.enabled ? "On" : "Off"}
        </span>

        {autopay.card ? (
          <span className="text-sm text-[var(--admin-fg)]">
            {autopay.card.brand ? titleCase(autopay.card.brand) : "Card"} ending{" "}
            {autopay.card.last4 ?? "----"}
            {autopay.card.expMonth && autopay.card.expYear ? (
              <span className="ml-1.5 text-xs text-[var(--admin-fg-subtle)]">
                exp {String(autopay.card.expMonth).padStart(2, "0")}/{autopay.card.expYear}
                {autopay.card.expired ? " — expired" : autopay.card.expiringSoon ? " — expiring" : ""}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-sm text-[var(--admin-fg-muted)]">No card saved</span>
        )}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {autopay.consentAt ? (
          <Row label="Authorised">{formatDate(autopay.consentAt)}</Row>
        ) : null}
        {autopay.lastChargeAt ? (
          <Row label="Last charged">{formatDate(autopay.lastChargeAt)}</Row>
        ) : null}
        {autopay.lastFailureAt ? (
          <Row label="Last failure">
            {formatDate(autopay.lastFailureAt)}
            {autopay.lastFailureCode ? (
              // The raw processor code, deliberately: staff are the ones who
              // have to tell the difference between "no funds" and "the bank
              // wanted a 3DS prompt nobody could answer".
              <span className="ml-1.5 font-mono text-xs text-[var(--admin-fg-subtle)]">
                {autopay.lastFailureCode}
              </span>
            ) : null}
          </Row>
        ) : null}
        {autopay.consecutiveFailures > 0 ? (
          <Row label="Failures in a row">{autopay.consecutiveFailures}</Row>
        ) : null}
      </dl>

      {autopay.enabled ? (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <AdminButton type="submit" variant="secondary" loading={pending}>
            {pending ? "Turning off" : "Turn AutoPay off"}
          </AdminButton>
          <span className="text-xs text-[var(--admin-fg-subtle)]">
            Only if they asked. They can turn it back on themselves.
          </span>
          {state.error ? (
            <span role="alert" className="text-xs text-red-500">
              {state.error}
            </span>
          ) : null}
        </form>
      ) : (
        <p className="text-xs text-[var(--admin-fg-subtle)]">
          Off. Only the client can turn it back on, from their portal.
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[var(--admin-fg)]">{children}</dd>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
