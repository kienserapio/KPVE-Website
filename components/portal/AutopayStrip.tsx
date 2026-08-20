import Link from "next/link";

import { formatMoney } from "@/lib/billing";
import type { PortalAutopayView } from "@/lib/dal/autopay";
import { formatDate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   AutoPay on the Overview: one line, and a link to the page that changes it.

   A server component with no state of its own. The dashboard's job is to answer
   "is anything about to happen to my money", and this is the shortest true
   answer to that — the controls live one click away rather than on the busiest
   page in the portal.
--------------------------------------------------------------------------- */

export function AutopayStrip({
  autopay,
  hasBalance,
}: {
  autopay: PortalAutopayView;
  /** Nothing owing and AutoPay off is not worth a line on the page. */
  hasBalance: boolean;
}) {
  if (!autopay.enabled && !hasBalance) return null;

  const attention =
    autopay.card?.expired || (autopay.needsAttention && autopay.enabled);
  const accent = attention ? "var(--svc-pending-fg)" : "var(--admin-accent)";

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
        background: `color-mix(in srgb, ${accent} 7%, transparent)`,
      }}
    >
      <div className="flex min-w-0 items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium" style={{ color: accent }}>
          {autopay.enabled ? "AutoPay is on" : "AutoPay is off"}
        </span>
        <span className="truncate text-xs text-[var(--admin-fg-muted)]">
          {describeState(autopay)}
        </span>
      </div>

      <Link
        href="/portal/autopay"
        className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
      >
        {autopay.enabled ? "Manage" : "Set it up"} &rarr;
      </Link>
    </div>
  );
}

/** Stripe reports brands lowercase ("visa"); nobody writes it that way. */
function titleCase(value: string | null): string | null {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}

function describeState(autopay: PortalAutopayView): string {
  if (!autopay.enabled) {
    return autopay.card
      ? "Your card is saved — turn it back on and we'll pay invoices as they fall due."
      : "Save a card once and your invoices pay themselves on the day they fall due.";
  }

  if (autopay.card?.expired) return "The saved card has expired — please save a new one.";
  if (autopay.needsAttention) return "The last attempt didn't go through.";

  if (!autopay.next) {
    return autopay.card
      ? `${titleCase(autopay.card.brand) ?? "Card"} ending ${autopay.card.last4 ?? "----"} · nothing outstanding`
      : "Nothing outstanding.";
  }

  const amount = formatMoney(autopay.next.amountCents, autopay.next.currency);

  return autopay.next.due
    ? `${amount} on ${autopay.next.number} will be paid on the next run.`
    : `${amount} on ${autopay.next.number}${
        autopay.next.dueDate ? `, ${formatDate(autopay.next.dueDate)}` : ""
      }`;
}
