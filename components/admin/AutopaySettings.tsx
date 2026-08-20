"use client";

import { useActionState } from "react";

import { setAutopayEnabledAction, type StaffAutopayState } from "@/lib/actions/autopay";
import { formatMoney } from "@/lib/billing";
import { AdminButton } from "./ui";

/* ---------------------------------------------------------------------------
   The AutoPay master switch, and the ceilings a run works under.

   Its own card rather than a field in the settings form on purpose. That form
   is a "change several things, press Save" affair; this is a switch someone
   reaches for when something looks wrong, and it should take one press with no
   chance of carrying half-edited invoice settings along with it.
--------------------------------------------------------------------------- */

const initialState: StaffAutopayState = { ok: false, error: null };

export function AutopaySettings({
  settings,
}: {
  settings: {
    enabled: boolean;
    maxInvoicesPerRun: number;
    maxCentsPerRun: number;
    maxInvoiceCents: number;
    noticeDays: number;
  };
}) {
  const [state, formAction, pending] = useActionState(setAutopayEnabledAction, initialState);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={
                settings.enabled
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
              {settings.enabled ? "Running" : "Paused"}
            </span>
            <span className="text-sm text-[var(--admin-fg)]">
              {settings.enabled
                ? "The nightly run charges saved cards for invoices that are due."
                : "No card will be charged automatically by anything."}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
            Pausing takes effect on the next run and changes nothing about any client&rsquo;s
            arrangement — their card and their authorisation stay exactly as they are.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Limit label="Invoices per run" value={String(settings.maxInvoicesPerRun)} />
        <Limit label="Total per run" value={formatMoney(settings.maxCentsPerRun, "AUD")} />
        <Limit label="Biggest invoice" value={formatMoney(settings.maxInvoiceCents, "AUD")} />
        <Limit label="Warning sent" value={`${settings.noticeDays} days ahead`} />
      </dl>

      <p className="text-xs leading-relaxed text-[var(--admin-fg-subtle)]">
        A run that hits any of those ceilings stops there and says what it skipped — they are
        there to catch a bug, not to shape billing. A normal night is a handful of invoices.
      </p>

      <form action={formAction} className="flex flex-wrap items-center gap-3 border-t border-[var(--admin-border)] pt-4">
        <input type="hidden" name="enabled" value={settings.enabled ? "false" : "true"} />
        <AdminButton
          type="submit"
          variant={settings.enabled ? "danger" : "primary"}
          loading={pending}
        >
          {pending
            ? settings.enabled
              ? "Pausing"
              : "Starting"
            : settings.enabled
              ? "Pause AutoPay"
              : "Start AutoPay"}
        </AdminButton>
        {state.error ? (
          <span role="alert" className="text-xs text-red-500">
            {state.error}
          </span>
        ) : null}
      </form>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm tabular-nums text-[var(--admin-fg)]">{value}</dd>
    </div>
  );
}
