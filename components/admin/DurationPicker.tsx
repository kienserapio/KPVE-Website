"use client";

import { useState } from "react";

import {
  cyclesForDuration,
  DURATION_PRESETS,
  formatCycles,
  formatDuration,
  formatMoney,
  formatRate,
  MAX_COVER_MONTHS,
  periodTotalCents,
} from "@/lib/billing";
import type { BillingInterval } from "@/lib/db/schema";
import { Money } from "./ui";

/* ---------------------------------------------------------------------------
   "Bill for" — how long one invoice covers.

   One component, used by the builder on the client page and by the re-price
   control on a draft, because the day those two disagree about what "2 years"
   costs is the day someone sends a client the wrong number.

   The thing it exists to prevent: a duration typed in the wrong unit. The field
   underneath is MONTHS, and "2" meaning two years is the easiest mistake on the
   page — it rounds to one annual charge and produces an invoice that looks
   exactly like the one-cycle invoice you were trying not to raise. So the custom
   input carries its own months/years selector, and the breakdown below always
   spells the answer out in charges and dollars before anything is created.
--------------------------------------------------------------------------- */

const controlClass =
  "rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/** A line the duration is applied to. The shape both callers already hold. */
export type DurationLine = {
  id: string;
  label: string;
  unitAmountCents: number;
  quantity: number;
  currency: string;
  /** Null when the billing line behind an invoice line has been deleted. */
  interval: BillingInterval | null;
};

type Unit = "months" | "years";

export function DurationPicker({
  id,
  months,
  onChange,
}: {
  id: string;
  months: number | null;
  onChange: (months: number | null) => void;
}) {
  // A stored duration that isn't one of the presets is a custom one, and the
  // box has to open showing it rather than snapping to the nearest preset.
  const isPreset = DURATION_PRESETS.some((preset) => preset.months === months);
  const [custom, setCustom] = useState(!isPreset);
  const [unit, setUnit] = useState<Unit>(
    months && months % 12 === 0 && months >= 12 ? "years" : "months",
  );
  // Held as text, not derived from `months`, so a half-typed "1" on the way to
  // "18" isn't rewritten under the cursor.
  const [raw, setRaw] = useState(() => {
    if (isPreset || !months) return "";
    return String(months % 12 === 0 && months >= 12 ? months / 12 : months);
  });

  function emit(nextRaw: string, nextUnit: Unit) {
    const value = Number(nextRaw);
    if (!nextRaw.trim() || !Number.isFinite(value) || value <= 0) {
      onChange(null);
      return;
    }
    const asMonths = nextUnit === "years" ? value * 12 : value;
    onChange(Math.min(Math.max(Math.trunc(asMonths), 1), MAX_COVER_MONTHS));
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]"
        >
          Bill for
        </label>
        <select
          id={id}
          value={custom ? "custom" : months === null ? "" : String(months)}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "custom") {
              setCustom(true);
              emit(raw, unit);
              return;
            }
            setCustom(false);
            onChange(value === "" ? null : Number(value));
          }}
          className={controlClass}
        >
          {DURATION_PRESETS.map((preset) => (
            <option key={preset.label} value={preset.months === null ? "" : preset.months}>
              {preset.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </div>

      {custom && (
        <>
          <input
            type="number"
            min={1}
            max={unit === "years" ? Math.floor(MAX_COVER_MONTHS / 12) : MAX_COVER_MONTHS}
            step={1}
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              emit(event.target.value, unit);
            }}
            placeholder="18"
            aria-label="How long to bill for"
            className={`${controlClass} w-24`}
          />
          {/* The unit is a control, not a caption. A months-only field is what
              turns "2 years" into two months and a $88 invoice. */}
          <select
            value={unit}
            aria-label="Months or years"
            onChange={(event) => {
              const next = event.target.value as Unit;
              setUnit(next);
              emit(raw, next);
            }}
            className={controlClass}
          >
            <option value="months">months</option>
            <option value="years">years</option>
          </select>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The working, in full.

   Not a nicety: the duration is applied per line, and a monthly line and an
   annual one get different numbers of charges out of the same span. Showing
   only a total would leave that invisible until the client queried it.
--------------------------------------------------------------------------- */

export function DurationBreakdown({
  lines,
  months,
  taxNote = true,
}: {
  lines: DurationLine[];
  months: number | null;
  /** False once the caller prints the GST itself, so it isn't said twice. */
  taxNote?: boolean;
}) {
  if (lines.length === 0) return null;

  const currency = lines[0].currency;
  const mixed = new Set(lines.map((line) => line.currency.toUpperCase())).size > 1;

  const priced = lines.map((line) => {
    const cycles = line.interval ? cyclesForDuration(line.interval, months) : 1;
    return {
      ...line,
      cycles,
      amountCents: periodTotalCents(line.unitAmountCents, line.quantity, cycles),
    };
  });
  const totalCents = priced.reduce((sum, line) => sum + line.amountCents, 0);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2.5">
      <ul className="flex flex-col gap-1">
        {priced.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
          >
            <span className="min-w-0 text-[var(--admin-fg-muted)]">
              <span className="font-medium text-[var(--admin-fg)]">{line.label}</span>
              {" — "}
              {line.interval
                ? `${line.quantity > 1 ? `${line.quantity} × ` : ""}${formatRate(
                    line.unitAmountCents,
                    line.currency,
                    line.interval,
                  )}`
                : "line no longer on the client"}
              {line.interval === "one_off" && months ? (
                <span className="text-[var(--admin-fg-subtle)]"> · one-off, not multiplied</span>
              ) : line.cycles > 1 ? (
                <span className="text-[var(--admin-fg-subtle)]">
                  {" "}
                  · {formatCycles(line.interval!, line.cycles)}
                </span>
              ) : null}
            </span>
            <Money className="shrink-0 text-xs font-medium">
              {formatMoney(line.amountCents, line.currency)}
            </Money>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between gap-3 border-t border-[var(--admin-border)] pt-2">
        <span className="text-xs font-medium text-[var(--admin-fg)]">
          {months ? `${formatDuration(months)} up front` : "One billing cycle"}
        </span>
        <Money className="text-sm font-semibold">
          {mixed ? "—" : formatMoney(totalCents, currency)}
        </Money>
      </div>

      {taxNote && !mixed && (
        <p className="text-[11px] text-[var(--admin-fg-subtle)]">
          Before GST — the invoice applies whatever Settings says.
        </p>
      )}
    </div>
  );
}

/** The same total the breakdown prints, for a caller that wants it on a button. */
export function durationTotalCents(lines: DurationLine[], months: number | null): number {
  return lines.reduce(
    (sum, line) =>
      sum +
      periodTotalCents(
        line.unitAmountCents,
        line.quantity,
        line.interval ? cyclesForDuration(line.interval, months) : 1,
      ),
    0,
  );
}
