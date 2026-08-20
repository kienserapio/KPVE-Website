import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { saveSimulatedCardAction } from "@/lib/actions/autopay-simulator";
import { getAutopaySetupByRef } from "@/lib/dal/autopay-run";
import { paymentsAreSimulated } from "@/lib/payments";
import { MOCK_CARDS } from "@/lib/payments/mock";
import { CheckoutShell } from "../../_components/CheckoutShell";

/* ---------------------------------------------------------------------------
   The simulated "save a card" page — AutoPay's answer to /pay/[ref].

   Choosing a card here chooses how the next charge behaves, which is the whole
   point: `authentication_required` and a plain decline are the two outcomes
   AutoPay has to handle well, and neither is reachable by being careful with a
   real card. These are the simulator's equivalents of Stripe's test cards.

   With live keys the client never sees this — Stripe's own page collects the
   card — and the action behind the button refuses to run.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Save a card — KPVE",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SimulatedSetupPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;

  // Live keys, so this page is not part of the flow. 404 rather than an
  // explanation: an unreachable page should look unreachable.
  if (!paymentsAreSimulated()) notFound();

  const setup = await getAutopaySetupByRef(ref);
  // A wrong or superseded ref says nothing else, for the same reason the
  // simulated checkout doesn't: confirming which refs exist makes them
  // enumerable.
  if (!setup) notFound();

  return (
    <CheckoutShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            AutoPay for
          </p>
          <h1 className="mt-1 font-sora text-xl font-semibold tracking-tight text-white">
            {setup.clientName}
          </h1>
        </div>

        <div className="rounded-xl border border-line-2 bg-ink-soft p-5">
          <p className="text-sm leading-relaxed text-muted">
            Payments are simulated, so no card details are collected. Pick one of the test
            cards below — each one behaves differently when AutoPay charges it, which is how
            the failure paths get exercised.
          </p>
        </div>

        <form action={saveSimulatedCardAction} className="flex flex-col gap-3">
          <input type="hidden" name="setupRef" value={ref} />

          {MOCK_CARDS.map((card, index) => (
            <label
              key={card.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-ink-soft p-4 transition-colors hover:border-line-3"
            >
              <input
                type="radio"
                name="cardId"
                value={card.id}
                defaultChecked={index === 0}
                required
                className="mt-1 size-4 shrink-0 accent-gold"
              />
              <span className="min-w-0">
                <span className="block font-medium text-white">{card.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{card.behaviour}</span>
              </span>
            </label>
          ))}

          <button
            type="submit"
            className="mt-2 rounded-xl bg-gold px-5 py-3 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Save this card
          </button>
        </form>

        <p className="text-xs leading-relaxed text-muted">
          Simulated — nothing is sent to a payment provider and no money can move.
        </p>
      </div>
    </CheckoutShell>
  );
}
