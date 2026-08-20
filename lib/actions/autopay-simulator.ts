"use server";

import { redirect } from "next/navigation";

import { completeAutopaySetup, getAutopaySetupByRef } from "@/lib/dal/autopay-run";
import { MOCK_CARDS } from "@/lib/payments/mock";
import { paymentsAreSimulated } from "@/lib/payments";

/* ---------------------------------------------------------------------------
   The simulated "save a card" step.

   The twin of simulatePayment() in lib/dal/payments.ts, and it exists for the
   same reason: every branch of AutoPay has to be reachable with no Stripe
   account and no money. Choosing a card here is choosing which way the next
   charge will go — see MOCK_CARDS.

   Against Stripe this whole file is dead: the card is entered on Stripe's page
   and the webhook records it. The guard below is what keeps it that way, and it
   is not a formality — without it, a POST to this action would attach a fake
   payment method to a live client and every real charge would fail.
--------------------------------------------------------------------------- */

export async function saveSimulatedCardAction(formData: FormData): Promise<void> {
  if (!paymentsAreSimulated()) {
    throw new Error("The simulated card page is not available while payments are live.");
  }

  const setupRef = String(formData.get("setupRef") ?? "");
  const cardId = String(formData.get("cardId") ?? "");

  const card = MOCK_CARDS.find((option) => option.id === cardId);
  if (!setupRef || !card) throw new Error("NOT_FOUND");

  const setup = await getAutopaySetupByRef(setupRef);
  if (!setup) throw new Error("NOT_FOUND");

  await completeAutopaySetup({
    setupRef,
    provider: "mock",
    paymentMethodId: card.id,
    brand: card.brand,
    last4: card.last4,
    // Two years out, so the simulated card is never accidentally the reason a
    // test run refuses to charge.
    expMonth: 12,
    expYear: new Date().getUTCFullYear() + 2,
  });

  redirect("/portal/autopay?saved=1");
}
