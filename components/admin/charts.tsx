import type { TimePoint, CategoryCount } from "@/lib/dal/dashboard";
import type { ServiceRevenue } from "@/lib/dal/services";
import type { LeadStatus } from "@/lib/db/schema";
import { formatMoney } from "@/lib/billing";
import { CATEGORY_LABELS, STATUS_LABELS } from "./ui";

/* ---------------------------------------------------------------------------
   Charts are server-rendered, single-series, and directly labelled — so no
   legend and no hover layer is needed to read them. Colour is one accent hue
   for magnitude (enquiries, categories) and the existing per-status tokens for
   the pipeline, which already brand each stage. All colour comes from CSS vars
   so the charts track the light/dark admin theme.
--------------------------------------------------------------------------- */

/** Weekly enquiry volume — vertical bars, count labelled above each. */
export function WeeklyBars({ data }: { data: TimePoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <figure className="m-0">
      <div className="flex h-40 items-end gap-2" role="img" aria-label="Enquiries per week">
        {data.map((d) => {
          // Floor a non-zero bar at 4% so a single enquiry is still visible.
          const pct = d.value === 0 ? 0 : Math.max(4, (d.value / max) * 100);
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs font-medium tabular-nums text-[var(--admin-fg-muted)]">
                {d.value > 0 ? d.value : ""}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-[var(--admin-accent)] transition-[height]"
                  style={{ height: `${pct}%`, minHeight: d.value > 0 ? 4 : 0 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[10px] tabular-nums text-[var(--admin-fg-subtle)]"
          >
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

const STATUS_VAR: Record<LeadStatus, string> = {
  new: "--st-new-fg",
  contacted: "--st-contacted-fg",
  qualified: "--st-qualified-fg",
  converted: "--st-converted-fg",
  archived: "--st-archived-fg",
};

const PIPELINE_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
];

/** Pipeline distribution — one horizontal bar per status, coloured by stage. */
export function PipelineBars({
  byStatus,
}: {
  byStatus: Record<LeadStatus, number>;
}) {
  const max = Math.max(1, ...PIPELINE_ORDER.map((s) => byStatus[s]));

  return (
    <div className="flex flex-col gap-3">
      {PIPELINE_ORDER.map((status) => {
        const value = byStatus[status];
        const pct = value === 0 ? 0 : Math.max(3, (value / max) * 100);
        const color = `var(${STATUS_VAR[status]})`;
        return (
          <div key={status} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-[var(--admin-fg-muted)]">
              {STATUS_LABELS[status]}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--admin-surface-2)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--admin-fg)]">
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where the recurring money comes from — one bar per service, monthly
 * equivalent. The amount is printed on the row rather than on an axis: there
 * are only a handful of bars, and an exact number beats reading a gridline.
 */
export function RevenueBars({ data }: { data: ServiceRevenue[] }) {
  const shown = data.filter((d) => d.mrrCents > 0);

  if (shown.length === 0) {
    return (
      <p className="text-sm text-[var(--admin-fg-muted)]">
        No recurring revenue yet. Put a client on a service and it shows up here.
      </p>
    );
  }

  const max = Math.max(1, ...shown.map((d) => d.mrrCents));

  return (
    <div className="flex flex-col gap-3">
      {shown.map((d) => {
        const pct = Math.max(3, (d.mrrCents / max) * 100);
        return (
          <div key={`${d.label}-${d.currency}`} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-[var(--admin-fg-muted)]">
              {d.label}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--admin-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--admin-accent)]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--admin-fg)]">
              {formatMoney(d.mrrCents, d.currency)}
            </span>
          </div>
        );
      })}
      <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
        Per month. Weekly lines are counted at 52/12, annual at 1/12.
      </p>
    </div>
  );
}

/** Category breakdown — horizontal bars, single accent hue, count labelled. */
export function CategoryBars({ data }: { data: CategoryCount[] }) {
  const shown = data.filter((d) => d.value > 0);

  if (shown.length === 0) {
    return (
      <p className="text-sm text-[var(--admin-fg-muted)]">No enquiries to categorise yet.</p>
    );
  }

  const max = Math.max(1, ...shown.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {shown.map((d) => {
        const pct = Math.max(3, (d.value / max) * 100);
        return (
          <div key={d.category} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-[var(--admin-fg-muted)]">
              {CATEGORY_LABELS[d.category]}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--admin-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--admin-accent)]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-[var(--admin-fg)]">
              {d.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
