import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCheckoutByRef } from "@/lib/dal/payments";
import { formatMoney, INTERVAL_LABELS, isRecurring } from "@/lib/billing";
import { CheckoutShell } from "../_components/CheckoutShell";
import { CheckoutForm } from "./CheckoutForm";

/* ---------------------------------------------------------------------------
   The simulated checkout.

   This page exists so the whole payment path is real before Stripe is. Staff
   send the link, the client opens it, presses Pay, and the CRM reacts exactly
   as it will when a card clears — because the button calls the same function
   the Stripe webhook does.

   With live Stripe keys set, links point at Stripe's own checkout instead and
   nobody ever lands here. The route stays: it is also what a stale simulated
   link resolves to, and "this link has already been paid" beats a 404.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Payment — KPVE",
  // A payment link must never turn up in a search result.
  robots: { index: false, follow: false },
};

// The page reflects live payment state; nothing here may be cached.
export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const checkout = await getCheckoutByRef(ref);

  // A wrong or revoked ref is a 404 and says nothing else. Confirming that a
  // ref "exists but is expired" would make the links enumerable.
  if (!checkout) notFound();

  const recurring = isRecurring(checkout.interval);

  return (
    <CheckoutShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Payment for
          </p>
          <h1 className="mt-1 font-sora text-xl font-semibold tracking-tight text-white">
            {checkout.clientName}
          </h1>
        </div>

        <div className="rounded-xl border border-line-2 bg-ink-soft p-5">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{checkout.label}</p>
              <p className="mt-0.5 text-xs text-muted">
                {recurring
                  ? `${INTERVAL_LABELS[checkout.interval]} — cancel any time`
                  : "One-off payment"}
              </p>
            </div>
            <p className="shrink-0 font-sora text-2xl font-semibold tabular-nums text-gold-bright">
              {formatMoney(checkout.amountCents, checkout.currency)}
            </p>
          </div>
          <p className="mt-3 border-t border-line-2 pt-3 text-xs text-muted">
            Charged in {checkout.currency}
            {recurring ? `, ${INTERVAL_LABELS[checkout.interval].toLowerCase()}` : ""}.
          </p>
        </div>

        {checkout.paid ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-center">
            <p className="font-medium text-success">Already paid</p>
            <p className="mt-1 text-sm text-muted-3">
              This one is settled — no need to pay again.
            </p>
          </div>
        ) : (
          <>
            <CheckoutForm paymentRef={checkout.ref} />
            {checkout.simulated && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-center text-xs text-warning">
                Test mode — no card is taken and no money moves.
              </p>
            )}
          </>
        )}
      </div>
    </CheckoutShell>
  );
}
