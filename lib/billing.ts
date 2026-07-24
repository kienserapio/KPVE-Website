import type { BillingInterval } from "@/lib/db/schema";

/* ---------------------------------------------------------------------------
   Money and billing maths — the single source of truth for how an amount and
   an interval become MRR. Imported by the DAL, the server actions and the UI,
   so a change to the rules changes every number on screen at once.

   Two rules everything here follows:
     1. Money is integer minor units ("cents"). Floats do not add up.
     2. Amounts in different currencies are never summed. Totals are grouped
        by currency, and the UI says so when more than one is in play.
--------------------------------------------------------------------------- */

export const BILLING_INTERVALS: BillingInterval[] = [
  "one_off",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
];

/** Recurring only — the choices offered when someone wants a billing cycle. */
export const RECURRING_INTERVALS: BillingInterval[] = [
  "weekly",
  "monthly",
  "quarterly",
  "annually",
];

export const INTERVAL_LABELS: Record<BillingInterval, string> = {
  one_off: "One-off",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

/** Compact suffix for inline money — "$11.00/mo". */
export const INTERVAL_SUFFIX: Record<BillingInterval, string> = {
  one_off: " one-off",
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
  annually: "/yr",
};

export function isRecurring(interval: BillingInterval): boolean {
  return interval !== "one_off";
}

/* ---------------------------------------------------------------------------
   MRR
--------------------------------------------------------------------------- */

/**
 * Monthly-equivalent multiplier per interval. Weekly uses 52/12 rather than
 * 4 — there are 52.18 weeks in a year, and "×4" quietly under-reports weekly
 * revenue by 8%. One-offs are 0: they are booked revenue, not recurring, and
 * folding them into MRR makes a good month look like a permanent raise.
 */
const MONTHLY_FACTOR: Record<BillingInterval, number> = {
  one_off: 0,
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annually: 1 / 12,
};

/** Monthly-equivalent value of one line, in cents. */
export function monthlyCents(amountCents: number, interval: BillingInterval): number {
  return Math.round(amountCents * MONTHLY_FACTOR[interval]);
}

export function annualCents(amountCents: number, interval: BillingInterval): number {
  return monthlyCents(amountCents, interval) * 12;
}

export type BillableLine = {
  amountCents: number;
  currency: string;
  interval: BillingInterval;
};

export type CurrencyTotal = {
  currency: string;
  mrrCents: number;
  arrCents: number;
  oneOffCents: number;
  lines: number;
};

/**
 * Roll a set of lines up per currency. Callers pass only the lines that should
 * count (normally status = active) — this function does no filtering, so the
 * decision about what counts stays with the caller.
 */
export function summarize(lines: BillableLine[]): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const line of lines) {
    const currency = line.currency.toUpperCase();
    const total =
      byCurrency.get(currency) ??
      { currency, mrrCents: 0, arrCents: 0, oneOffCents: 0, lines: 0 };

    if (line.interval === "one_off") {
      total.oneOffCents += line.amountCents;
    } else {
      total.mrrCents += monthlyCents(line.amountCents, line.interval);
    }
    total.lines += 1;
    byCurrency.set(currency, total);
  }

  for (const total of byCurrency.values()) total.arrCents = total.mrrCents * 12;

  // Biggest first, so "the" currency is the one carrying the business.
  return [...byCurrency.values()].sort(
    (a, b) => b.mrrCents + b.oneOffCents - (a.mrrCents + a.oneOffCents),
  );
}

/** The headline total, plus whether other currencies are being left out of it. */
export function primaryTotal(totals: CurrencyTotal[], fallbackCurrency = DEFAULT_CURRENCY) {
  const primary =
    totals[0] ??
    { currency: fallbackCurrency, mrrCents: 0, arrCents: 0, oneOffCents: 0, lines: 0 };
  return { ...primary, mixed: totals.length > 1 };
}

/* ---------------------------------------------------------------------------
   Formatting
--------------------------------------------------------------------------- */

export const DEFAULT_CURRENCY = "AUD";

/** Currencies offered in the UI. Anything else needs a code change on purpose. */
export const CURRENCIES = ["AUD", "USD", "NZD", "GBP", "EUR"] as const;

/**
 * "$1,234.56". Whole amounts drop the cents ("$11" not "$11.00") — a catalogue
 * of round numbers reads better without a column of ".00".
 */
export function formatMoney(
  cents: number,
  currency: string = DEFAULT_CURRENCY,
  options: { alwaysCents?: boolean } = {},
): string {
  const whole = cents % 100 === 0;
  const fractionDigits = options.alwaysCents || !whole ? 2 : 0;

  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "$11/mo" — the way a line reads inside a table row. */
export function formatRate(
  cents: number,
  currency: string,
  interval: BillingInterval,
): string {
  return `${formatMoney(cents, currency)}${INTERVAL_SUFFIX[interval]}`;
}

/* ---------------------------------------------------------------------------
   Parsing

   Staff type money, not cents. "$11", "11.00", "1,100", "11 AUD" all mean the
   same thing and all have to land on the same integer.
--------------------------------------------------------------------------- */

/** Postgres `integer` tops out at 2,147,483,647 — cap well below it. */
export const MAX_AMOUNT_CENTS = 999_999_999;

export function parseAmountToCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s,$£€]|[A-Za-z]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;

  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) return null;
  return cents;
}

/** Cents → the string an editable input should start with ("1100" → "11.00"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/* ---------------------------------------------------------------------------
   Quantity

   "4 emails at $11" is one line with a unit price and a count, not a retyped
   $44. The stored `amount_cents` stays the LINE TOTAL (see the invariant on
   client_services.amount_cents) — this function is the only thing that should
   ever compute it, so the two numbers and the total cannot drift apart.
--------------------------------------------------------------------------- */

/**
 * A sane upper bound. Nobody has 10,000 mailboxes, and without a cap a typo in
 * a quantity box multiplies into an amount that overflows the integer column
 * and fails at the database rather than at the form.
 */
export const MAX_QUANTITY = 9999;

/** Line total = unit × qty, clamped so a bad input can't produce a bad row. */
export function lineTotalCents(unitAmountCents: number, quantity: number): number {
  // Coerce first: a quantity arriving as "" or NaN means one of the thing,
  // never zero — a line worth nothing is not what anyone typed.
  const qty = Number.isFinite(quantity) ? Math.trunc(quantity) : 1;
  const safeQty = Math.min(Math.max(qty, 1), MAX_QUANTITY);
  const unit = Number.isFinite(unitAmountCents) ? Math.max(Math.trunc(unitAmountCents), 0) : 0;

  return Math.min(unit * safeQty, MAX_AMOUNT_CENTS);
}

/* ---------------------------------------------------------------------------
   Tax (GST)

   Three states, and which one applies is a property of the ORG, snapshotted
   onto each invoice at issue so changing registration never rewrites history.

   Rounding happens ONCE, at the total — never per line. Rounding each line and
   adding them up produces an invoice whose printed parts don't sum to its
   printed whole, which is the single most common way a tax invoice gets
   bounced by an accountant.
--------------------------------------------------------------------------- */

export type TaxSettings = {
  gstRegistered: boolean;
  /** Basis points: 1000 = 10%, 1050 = 10.5%. Integers, so no rate ever rounds. */
  taxRateBps: number;
  pricesIncludeTax: boolean;
};

export type TaxBreakdown = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRateBps: number;
  mode: "none" | "inclusive" | "exclusive";
};

/**
 * Turn a set of line totals into the three numbers an invoice prints.
 *
 *  - NOT registered → mode "none": no tax line at all, total === subtotal.
 *    This is the default, and it is correct and legal for a business that
 *    isn't registered for GST.
 *  - Registered, prices INCLUDE tax → mode "inclusive" (the Australian norm).
 *    Stored amounts DO NOT CHANGE: $11 stays $11. The tax is extracted from
 *    the total — tax = total × rate / (10000 + rate) — and the invoice prints
 *    "Total includes GST of $1.00". Nothing in client_services, MRR, the
 *    payment links or the ledger moves, which is why it's the default.
 *  - Registered, prices EXCLUDE tax → mode "exclusive": tax is added on top,
 *    so the client pays more than the stored amount. Offered for completeness;
 *    switching it after invoices exist changes what clients pay.
 */
export function computeTax(
  lineTotalsCents: number[] | number,
  settings: TaxSettings,
): TaxBreakdown {
  const lines = Array.isArray(lineTotalsCents) ? lineTotalsCents : [lineTotalsCents];
  // Sum of the stored line totals. Whether this is the subtotal or the total
  // depends entirely on the mode below — that's the whole inclusive/exclusive
  // distinction.
  const sum = lines.reduce((acc, cents) => acc + (Number.isFinite(cents) ? cents : 0), 0);

  const rate = Number.isFinite(settings.taxRateBps)
    ? Math.max(Math.trunc(settings.taxRateBps), 0)
    : 0;

  // Not registered, or a zero rate: there is nothing to print and nothing to
  // extract. Claiming a $0 GST line on an invoice would be worse than silence.
  if (!settings.gstRegistered || rate === 0) {
    return {
      subtotalCents: sum,
      taxCents: 0,
      totalCents: sum,
      taxRateBps: 0,
      mode: "none",
    };
  }

  if (settings.pricesIncludeTax) {
    const taxCents = Math.round((sum * rate) / (10000 + rate));
    return {
      subtotalCents: sum - taxCents,
      taxCents,
      totalCents: sum,
      taxRateBps: rate,
      mode: "inclusive",
    };
  }

  const taxCents = Math.round((sum * rate) / 10000);
  return {
    subtotalCents: sum,
    taxCents,
    totalCents: sum + taxCents,
    taxRateBps: rate,
    mode: "exclusive",
  };
}

/** 1000 → "10%", 1050 → "10.5%". No trailing ".0" — nobody writes "10.0% GST". */
export function formatTaxRate(bps: number): string {
  const percent = (Number.isFinite(bps) ? bps : 0) / 100;
  return `${Number(percent.toFixed(2))}%`;
}

/* ---------------------------------------------------------------------------
   Quantity formatting
--------------------------------------------------------------------------- */

/**
 * How a quantity line reads inline: "4 × $11.00/mo", or "4 mailboxes ×
 * $11.00/mo" when the catalogue entry says what a unit is. A quantity of one
 * returns just the rate — "1 × $30/mo" is noise on every single-unit line,
 * which is most of them.
 */
export function formatQuantityLine(
  unitCents: number,
  quantity: number,
  currency: string,
  interval: BillingInterval,
  unitLabel?: string | null,
): string {
  const rate = formatRate(unitCents, currency, interval);
  const qty = Number.isFinite(quantity) ? Math.trunc(quantity) : 1;
  if (qty <= 1) return rate;

  const label = unitLabel?.trim();
  if (!label) return `${qty} × ${rate}`;

  // Naive plural, deliberately: "mailbox" → "mailboxs" is wrong but the field
  // is staff-typed and staff can type "mailboxes". A pluralisation library for
  // one label is not a dependency worth carrying.
  const plural = qty !== 1 && !label.endsWith("s") ? `${label}s` : label;
  return `${qty} ${plural} × ${rate}`;
}

/* ---------------------------------------------------------------------------
   Dates
--------------------------------------------------------------------------- */

/**
 * Add n months, clamping to the end of the target month. Plain
 * `setMonth(m + 1)` turns 31 Jan into 3 Mar, which would silently skip a
 * billing month for anything started on the 29th–31st.
 */
function addMonths(date: Date, n: number): Date {
  const day = date.getDate();
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + n);
  const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInMonth));
  return result;
}

/** The date one billing cycle after `from`. One-offs never recur. */
export function addInterval(from: Date, interval: BillingInterval): Date | null {
  switch (interval) {
    case "one_off":
      return null;
    case "weekly": {
      const next = new Date(from);
      next.setDate(next.getDate() + 7);
      return next;
    }
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "annually":
      return addMonths(from, 12);
  }
}

/**
 * Next due date for a line starting on `startedAt`. Rolls forward past any
 * cycles already in the past, so a service backdated six months lands on the
 * next real charge rather than one from January.
 */
export function nextBillFrom(startedAt: Date, interval: BillingInterval, now = new Date()): Date | null {
  if (interval === "one_off") return null;

  let next = addInterval(startedAt, interval);
  // Bounded so a bad date can't spin: 500 weekly cycles is ~9.5 years.
  for (let i = 0; next && next.getTime() <= now.getTime() && i < 500; i++) {
    next = addInterval(next, interval);
  }
  return next;
}
