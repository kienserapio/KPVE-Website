import type { Metadata } from "next";

import { CheckoutShell } from "../_components/CheckoutShell";

/** Where Stripe sends the client if they back out of checkout. Nothing was charged. */
export const metadata: Metadata = {
  title: "Payment cancelled — KPVE",
  robots: { index: false, follow: false },
};

export default function PaymentCancelledPage() {
  return (
    <CheckoutShell>
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-sora text-xl font-semibold tracking-tight text-white">
          Payment cancelled
        </h1>
        <p className="text-sm text-muted-3">
          Nothing was charged. Your original payment link still works — open it
          again whenever you&apos;re ready, or reply to our email if something
          looked wrong.
        </p>
      </div>
    </CheckoutShell>
  );
}
