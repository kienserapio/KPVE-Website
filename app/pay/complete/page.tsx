import type { Metadata } from "next";

import { CheckoutShell } from "../_components/CheckoutShell";

/* ---------------------------------------------------------------------------
   Where Stripe sends the client after a successful checkout.

   It confirms nothing by itself. The payment is recorded when the webhook
   arrives and the signature checks out — never because a browser reached a
   URL, which anyone can do by typing it. So this page thanks them and stops.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Thank you — KPVE",
  robots: { index: false, follow: false },
};

export default function PaymentCompletePage() {
  return (
    <CheckoutShell>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-6">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <h1 className="font-sora text-xl font-semibold tracking-tight text-white">
            Thank you
          </h1>
          <p className="mt-2 text-sm text-muted-3">
            Your payment went through. A receipt is on its way to your inbox, and
            we&apos;ll be in touch about next steps.
          </p>
        </div>
      </div>
    </CheckoutShell>
  );
}
