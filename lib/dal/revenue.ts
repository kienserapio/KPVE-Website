import "server-only";

import { desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientServices, revenueSnapshots } from "@/lib/db/schema";
import {
  DEFAULT_CURRENCY,
  monthlyCents,
  summarize,
  type BillableLine,
  type CurrencyTotal,
} from "@/lib/billing";
import { requireSession } from "./session";

/* ---------------------------------------------------------------------------
   Revenue over time.

   The live tables only describe *now*. Change a price and last month's MRR
   changes with it; cancel a service and it was never there. Two mechanisms fix
   that, and the difference between them is labelled everywhere it shows:

     SNAPSHOT — a row written for a month, by `npm run revenue:snapshot` or the
       first Revenue page view of the day. Authoritative: it is what the number
       actually was.

     ESTIMATE — reconstructed for months with no snapshot, from each line's
       started_at / cancelled_at. Right about when things began and ended,
       blind to anything in between (a pause, a mid-month reprice). It exists so
       the chart is readable on day one instead of a single dot.

   Estimates get replaced by snapshots as they accumulate; nothing overwrites a
   snapshot that already exists for a past month.
--------------------------------------------------------------------------- */

export type RevenuePoint = {
  /** 'YYYY-MM-01' — the month this describes. */
  period: string;
  label: string;
  mrrCents: number;
  currency: string;
  /** False when reconstructed rather than recorded. The UI marks these. */
  recorded: boolean;
};

export type MrrMovement = {
  currency: string;
  /** Monthly value of lines that started this month. */
  newCents: number;
  /** Monthly value of lines cancelled this month. Positive number. */
  churnedCents: number;
  /** newCents - churnedCents. */
  netCents: number;
  newLines: number;
  churnedLines: number;
};

export type RevenueHistory = {
  currency: string;
  points: RevenuePoint[];
  movement: MrrMovement;
  /** How many months in the series came from a real snapshot. */
  recordedMonths: number;
  currencies: string[];
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-AU", { month: "short" });

/** 'YYYY-MM-01' for the month containing `date`, in local time. */
function periodKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-01`;
}

/** Last instant of the month a period key names — the point MRR is measured at. */
function periodEnd(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function monthsBack(count: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(periodKey(new Date(from.getFullYear(), from.getMonth() - i, 1)));
  }
  return out;
}

type LineRow = {
  amountCents: number;
  currency: string;
  interval: BillableLine["interval"];
  status: string;
  startedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

/**
 * What MRR looked like at `at`, rebuilt from start and cancel dates.
 *
 * A line counts if it had started by then and had not been cancelled by then.
 * Draft lines never count — they were never sold. Lines with no start date fall
 * back to their creation date, which is when someone first typed them in.
 */
function reconstructMrr(lines: LineRow[], at: Date, currency: string): number {
  const at_ = at.getTime();
  let total = 0;

  for (const line of lines) {
    if (line.currency.toUpperCase() !== currency) continue;
    if (line.status === "draft") continue;
    if (line.interval === "one_off") continue;

    const started = (line.startedAt ?? line.createdAt).getTime();
    if (started > at_) continue;
    if (line.cancelledAt && line.cancelledAt.getTime() <= at_) continue;

    total += monthlyCents(line.amountCents, line.interval);
  }

  return total;
}

export async function getRevenueHistory(months = 12): Promise<RevenueHistory> {
  await requireSession();

  const periods = monthsBack(months);

  const [lines, snapshots] = await Promise.all([
    db
      .select({
        amountCents: clientServices.amountCents,
        currency: clientServices.currency,
        interval: clientServices.interval,
        status: clientServices.status,
        startedAt: clientServices.startedAt,
        cancelledAt: clientServices.cancelledAt,
        createdAt: clientServices.createdAt,
      })
      .from(clientServices),
    db
      .select({
        period: revenueSnapshots.period,
        currency: revenueSnapshots.currency,
        mrrCents: revenueSnapshots.mrrCents,
      })
      .from(revenueSnapshots)
      .where(inArray(revenueSnapshots.period, periods)),
  ]);

  // The headline currency is whichever one carries today's recurring revenue.
  const activeLines = lines.filter((l) => l.status === "active");
  const totals = summarize(activeLines);
  const currency = totals[0]?.currency ?? DEFAULT_CURRENCY;
  const currencies = [...new Set(lines.map((l) => l.currency.toUpperCase()))].sort();

  const bySnapshot = new Map(
    snapshots
      .filter((s) => s.currency.toUpperCase() === currency)
      .map((s) => [s.period, s.mrrCents]),
  );

  const points: RevenuePoint[] = periods.map((period) => {
    const recorded = bySnapshot.has(period);
    return {
      period,
      label: MONTH_LABEL.format(periodEnd(period)),
      mrrCents: recorded
        ? bySnapshot.get(period)!
        : reconstructMrr(lines, periodEnd(period), currency),
      currency,
      recorded,
    };
  });

  return {
    currency,
    points,
    movement: computeMovement(lines, currency),
    recordedMonths: points.filter((p) => p.recorded).length,
    currencies,
  };
}

/**
 * New and churned MRR for the current month, from the lines themselves rather
 * than from snapshot deltas — a line that started on the 3rd is new revenue on
 * the 3rd, not at the end of the month when the next snapshot lands.
 */
function computeMovement(lines: LineRow[], currency: string): MrrMovement {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let newCents = 0;
  let churnedCents = 0;
  let newLines = 0;
  let churnedLines = 0;

  for (const line of lines) {
    if (line.currency.toUpperCase() !== currency) continue;
    if (line.interval === "one_off") continue;

    const value = monthlyCents(line.amountCents, line.interval);

    const started = (line.startedAt ?? line.createdAt).getTime();
    if (line.status !== "draft" && line.status !== "cancelled" && started >= monthStart) {
      newCents += value;
      newLines += 1;
    }

    if (line.cancelledAt && line.cancelledAt.getTime() >= monthStart) {
      churnedCents += value;
      churnedLines += 1;
    }
  }

  return {
    currency,
    newCents,
    churnedCents,
    netCents: newCents - churnedCents,
    newLines,
    churnedLines,
  };
}

/* ---------------------------------------------------------------------------
   Capture
--------------------------------------------------------------------------- */

export type SnapshotResult = { period: string; totals: CurrencyTotal[]; written: number };

/**
 * Record this month's numbers. Upserts, so running it twice in a day is a
 * no-op beyond refreshing the figure — and running it every day means the
 * month closes on its final value rather than whatever the 1st looked like.
 *
 * Takes no session: it is also called from `npm run revenue:snapshot`, which
 * has no user. It only ever reads aggregate money and writes a summary row, so
 * there is nothing here to leak.
 */
export async function captureRevenueSnapshot(now = new Date()): Promise<SnapshotResult> {
  const period = periodKey(now);

  const rows = await db
    .select({
      amountCents: clientServices.amountCents,
      currency: clientServices.currency,
      interval: clientServices.interval,
      clientId: clientServices.clientId,
    })
    .from(clientServices)
    .where(eq(clientServices.status, "active"));

  const totals = summarize(rows);

  const clientsByCurrency = new Map<string, Set<string>>();
  const linesByCurrency = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.toUpperCase();
    const set = clientsByCurrency.get(currency) ?? new Set<string>();
    set.add(row.clientId);
    clientsByCurrency.set(currency, set);
    linesByCurrency.set(currency, (linesByCurrency.get(currency) ?? 0) + 1);
  }

  for (const total of totals) {
    await db
      .insert(revenueSnapshots)
      .values({
        period,
        currency: total.currency,
        mrrCents: total.mrrCents,
        arrCents: total.arrCents,
        oneOffCents: total.oneOffCents,
        activeLines: linesByCurrency.get(total.currency) ?? 0,
        payingClients: clientsByCurrency.get(total.currency)?.size ?? 0,
        capturedAt: now,
      })
      .onConflictDoUpdate({
        target: [revenueSnapshots.period, revenueSnapshots.currency],
        set: {
          mrrCents: total.mrrCents,
          arrCents: total.arrCents,
          oneOffCents: total.oneOffCents,
          activeLines: linesByCurrency.get(total.currency) ?? 0,
          payingClients: clientsByCurrency.get(total.currency)?.size ?? 0,
          capturedAt: now,
        },
      });
  }

  return { period, totals, written: totals.length };
}

/**
 * Capture at most once a day, from a page render. Best-effort by design: the
 * Revenue page must render even if this write fails, so a snapshot is a side
 * benefit of someone looking at the page, never a precondition for it.
 */
export async function captureSnapshotIfStale(): Promise<void> {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [latest] = await db
      .select({ capturedAt: revenueSnapshots.capturedAt })
      .from(revenueSnapshots)
      .where(gte(revenueSnapshots.capturedAt, startOfToday))
      .orderBy(desc(revenueSnapshots.capturedAt))
      .limit(1);

    if (latest) return;
    await captureRevenueSnapshot();
  } catch (error) {
    console.error("[revenue] snapshot capture failed", error);
  }
}
