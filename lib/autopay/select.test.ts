import { describe, expect, it } from "vitest";

import {
  AUTOPAY_DEFAULT_CAPS,
  autopayIdempotencyKey,
  planAutopayRun,
  type AutopayInvoiceRow,
} from "./select";

/* ---------------------------------------------------------------------------
   The only tests in this repo, and they are here rather than anywhere else
   because this is the only function that decides to take money.

   Every case below is a way a client could be charged wrongly.
--------------------------------------------------------------------------- */

const ASOF = new Date("2026-08-20T00:00:00.000Z");

/** A payable invoice, due yesterday, on a client with a working saved card. */
function row(overrides: Partial<AutopayInvoiceRow> = {}): AutopayInvoiceRow {
  return {
    invoiceId: "11111111-1111-1111-1111-111111111111",
    number: "INV-2026-0001",
    clientId: "22222222-2222-2222-2222-222222222222",
    status: "sent",
    dueDate: new Date("2026-08-19T00:00:00.000Z"),
    currency: "AUD",
    totalCents: 13_400,
    amountPaidCents: 0,
    autopayEnabled: true,
    paymentMethodId: "pm_test",
    consecutiveFailures: 0,
    openAttempt: false,
    attemptCount: 0,
    noticeSentAt: new Date("2026-08-16T00:00:00.000Z"),
    checkoutCreatedAt: null,
    ...overrides,
  };
}

function plan(rows: AutopayInvoiceRow[], caps?: Parameters<typeof planAutopayRun>[1]["caps"]) {
  return planAutopayRun(rows, { asOf: ASOF, caps });
}

describe("planAutopayRun — what it charges", () => {
  it("charges an issued, due, unpaid invoice", () => {
    const result = plan([row()]);

    expect(result.charge).toHaveLength(1);
    expect(result.charge[0]).toMatchObject({
      number: "INV-2026-0001",
      amountCents: 13_400,
      currency: "AUD",
      attemptNo: 1,
    });
    expect(result.totalCents).toBe(13_400);
    expect(result.skipped).toHaveLength(0);
  });

  it("charges the balance, not the total, when part-paid", () => {
    const result = plan([row({ totalCents: 13_400, amountPaidCents: 5_000 })]);

    expect(result.charge[0].amountCents).toBe(8_400);
  });

  it("charges an invoice due exactly today", () => {
    const result = plan([row({ dueDate: new Date("2026-08-20T00:00:00.000Z") })]);

    expect(result.charge).toHaveLength(1);
  });

  it("ignores the time of day on a due date", () => {
    // A `date` column read back as a timestamp can arrive at 14:00 local. Due
    // today is due today whatever hour it claims.
    const result = plan([row({ dueDate: new Date("2026-08-20T23:59:59.000Z") })]);

    expect(result.charge).toHaveLength(1);
  });

  it("numbers the first attempt 1, and keys it to the invoice", () => {
    // There is only ever a first attempt — see the previous_attempt_failed
    // refusal below — but the number still has to reach the idempotency key,
    // because that key is what stops a retried REQUEST becoming a second
    // charge at the provider.
    const result = plan([row()]);

    expect(result.charge[0].attemptNo).toBe(1);
    expect(result.charge[0].idempotencyKey).toBe(
      autopayIdempotencyKey("11111111-1111-1111-1111-111111111111", 1),
    );
  });
});

describe("planAutopayRun — what it refuses", () => {
  const cases: [string, Partial<AutopayInvoiceRow>, string][] = [
    ["a draft", { status: "draft" }, "not_issued"],
    ["a void", { status: "void" }, "not_issued"],
    ["one already paid", { status: "paid" }, "already_settled"],
    ["one with nothing owed", { amountPaidCents: 13_400 }, "nothing_owed"],
    ["one overpaid", { amountPaidCents: 20_000 }, "nothing_owed"],
    ["a client with AutoPay off", { autopayEnabled: false }, "autopay_off"],
    ["a client with no saved card", { paymentMethodId: null }, "no_saved_card"],
    ["an invoice with no due date", { dueDate: null }, "no_due_date"],
    ["one not due yet", { dueDate: new Date("2026-08-21T00:00:00.000Z") }, "not_due_yet"],
    ["a card that keeps declining", { consecutiveFailures: 3 }, "too_many_failures"],
    ["an attempt already in flight", { openAttempt: true }, "attempt_in_flight"],
    ["one the client has not been warned about", { noticeSentAt: null }, "notice_not_sent"],
    [
      "one warned about only today",
      { noticeSentAt: new Date("2026-08-20T00:00:01.000Z") },
      "notice_too_recent",
    ],
    ["one already tried once", { attemptCount: 1 }, "previous_attempt_failed"],
    [
      "one the client has a live checkout link for",
      { checkoutCreatedAt: new Date("2026-08-19T18:00:00.000Z") },
      "checkout_in_flight",
    ],
    ["an invoice over the per-invoice cap", { totalCents: 500_000 }, "over_invoice_cap"],
  ];

  for (const [label, overrides, reason] of cases) {
    it(`refuses ${label}, and says why`, () => {
      const result = plan([row(overrides)]);

      expect(result.charge).toHaveLength(0);
      expect(result.skipped).toEqual([
        { invoiceId: row().invoiceId, number: "INV-2026-0001", reason },
      ]);
    });
  }

  it("charges once the notice is a day old, whatever hour it was sent at", () => {
    // The boundary is the day, not a rolling 24 hours: the job runs on a fixed
    // schedule and stamps the notice moments after its own asOf, so a
    // wall-clock window would miss by seconds and slip a day.
    for (const hour of ["00", "09", "23"]) {
      expect(
        plan([row({ noticeSentAt: new Date(`2026-08-19T${hour}:30:00.000Z`) })]).charge,
        `sent on the 19th at ${hour}:30`,
      ).toHaveLength(1);
    }
    expect(
      plan([row({ noticeSentAt: new Date("2026-08-20T00:00:00.000Z") })]).charge,
    ).toHaveLength(0);
  });

  it("charges once a stale checkout link has expired", () => {
    // 24 hours is Stripe's Checkout Session lifetime; a day-old link is dead.
    expect(
      plan([row({ checkoutCreatedAt: new Date("2026-08-18T00:00:00.000Z") })]).charge,
    ).toHaveLength(1);
    expect(
      plan([row({ checkoutCreatedAt: new Date("2026-08-19T18:00:00.000Z") })]).charge,
    ).toHaveLength(0);
  });

  it("stops one short of the failure ceiling rather than at it", () => {
    expect(plan([row({ consecutiveFailures: 2 })]).charge).toHaveLength(1);
    expect(plan([row({ consecutiveFailures: 3 })]).charge).toHaveLength(0);
  });

  it("allows an invoice exactly on the per-invoice cap", () => {
    const result = plan([row({ totalCents: AUTOPAY_DEFAULT_CAPS.maxInvoiceCents })]);

    expect(result.charge).toHaveLength(1);
  });
});

describe("planAutopayRun — the run caps", () => {
  function many(count: number, each: Partial<AutopayInvoiceRow> = {}) {
    return Array.from({ length: count }, (_, i) =>
      row({
        invoiceId: `invoice-${i}`,
        number: `INV-2026-${String(i).padStart(4, "0")}`,
        ...each,
      }),
    );
  }

  it("holds what will not fit under the count cap, and reports it", () => {
    const result = plan(many(5), { maxInvoicesPerRun: 3 });

    expect(result.charge).toHaveLength(3);
    expect(result.held).toHaveLength(2);
    expect(result.held.every((h) => h.reason === "run_count_cap")).toBe(true);
  });

  it("holds what will not fit under the amount cap", () => {
    const result = plan(many(4, { totalCents: 10_000 }), { maxCentsPerRun: 25_000 });

    expect(result.charge).toHaveLength(2);
    expect(result.totalCents).toBe(20_000);
    expect(result.held).toHaveLength(2);
    expect(result.held.every((h) => h.reason === "run_amount_cap")).toBe(true);
  });

  it("never silently drops anything — every row is accounted for", () => {
    const rows = [...many(4), row({ invoiceId: "skip-me", status: "draft" })];
    const result = plan(rows, { maxInvoicesPerRun: 2 });

    expect(result.charge.length + result.held.length + result.skipped.length).toBe(rows.length);
  });

  it("charges the oldest due first when a cap bites", () => {
    const rows = [
      row({ invoiceId: "new", number: "INV-2026-0009", dueDate: new Date("2026-08-19T00:00:00.000Z") }),
      row({ invoiceId: "old", number: "INV-2026-0002", dueDate: new Date("2026-06-01T00:00:00.000Z") }),
    ];
    const result = plan(rows, { maxInvoicesPerRun: 1 });

    expect(result.charge[0].invoiceId).toBe("old");
    expect(result.held[0].invoiceId).toBe("new");
  });

  it("plans the same way twice over the same data", () => {
    const rows = many(6);

    expect(plan(rows, { maxInvoicesPerRun: 3 })).toEqual(plan(rows, { maxInvoicesPerRun: 3 }));
  });

  it("a skipped invoice does not consume a slot", () => {
    const rows = [row({ invoiceId: "draft-1", status: "draft" }), ...many(2)];
    const result = plan(rows, { maxInvoicesPerRun: 2 });

    expect(result.charge).toHaveLength(2);
    expect(result.held).toHaveLength(0);
  });
});

describe("autopayIdempotencyKey", () => {
  it("is stable for the same invoice and attempt", () => {
    expect(autopayIdempotencyKey("abc", 2)).toBe(autopayIdempotencyKey("abc", 2));
  });

  it("differs per attempt, so a deliberate retry is a new charge", () => {
    expect(autopayIdempotencyKey("abc", 1)).not.toBe(autopayIdempotencyKey("abc", 2));
  });
});
