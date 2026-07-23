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
