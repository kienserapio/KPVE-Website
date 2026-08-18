import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Card } from "@/components/admin/ui";

/* ---------------------------------------------------------------------------
   The handful of shapes the portal's pages are built from.

   Surfaces, badges, tables and form controls all come from
   components/admin/ui.tsx — one visual language, one set of tokens, so the
   portal cannot drift into looking like a different product. What lives here is
   only what the portal needs and the CRM does not: headers written for the
   person being billed rather than the person doing the billing.
--------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-fg)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--admin-fg-muted)]">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName = "p-5",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 text-xs font-medium text-[var(--admin-accent)] hover:underline"
    >
      {children} →
    </Link>
  );
}

/* ---------------------------------------------------------------------------
   Deadlines

   A date alone makes the reader do arithmetic. "12 Sep 2026" and "due in 3
   days" are the same fact, but only one of them gets an invoice paid — so every
   deadline in the portal shows both, and the relative half carries the colour.
--------------------------------------------------------------------------- */

/**
 * "Due today", "Due in 5 days", "9 days overdue".
 *
 * `days` is computed on the server (see daysUntil in lib/dal/portal.ts) —
 * calling Date.now() in a component renders one answer during SSR and another
 * at hydration, and a deadline that flickers is a deadline nobody believes.
 */
export function relativeDue(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  const late = Math.abs(days);
  return late === 1 ? "1 day overdue" : `${late} days overdue`;
}

/** "Renews today", "Renews in 12 days", "Was due 4 days ago". */
export function relativeRenewal(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Renews today";
  if (days === 1) return "Renews tomorrow";
  if (days > 1) return `Renews in ${days} days`;
  const late = Math.abs(days);
  return late === 1 ? "Was due yesterday" : `Was due ${late} days ago`;
}

export function DueChip({
  days,
  overdue = false,
  renewal = false,
}: {
  days: number | null;
  overdue?: boolean;
  /** Word it as a renewal rather than as a payment deadline. */
  renewal?: boolean;
}) {
  const label = renewal ? relativeRenewal(days) : relativeDue(days);
  if (!label) return null;

  // Amber inside a week, red once it is late — the same two hues the CRM uses
  // for a pending and a failed thing, so the meaning transfers.
  const tone = overdue
    ? "text-[var(--pr-high-fg)]"
    : days !== null && days <= 7
      ? "text-[var(--svc-pending-fg)]"
      : "text-[var(--admin-fg-muted)]";

  return <span className={cn("text-xs font-medium", tone)}>{label}</span>;
}

/* ---------------------------------------------------------------------------
   Alert banner — the one thing on a page that is asking for something
--------------------------------------------------------------------------- */

export function Banner({
  tone,
  title,
  children,
  action,
}: {
  tone: "danger" | "warning" | "success" | "neutral";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const colorVar = {
    danger: "--pr-high-fg",
    warning: "--svc-pending-fg",
    success: "--svc-active-fg",
    neutral: "--admin-fg-muted",
  }[tone];

  const color = `var(${colorVar})`;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color }}>
          {title}
        </p>
        {children && (
          <div className="mt-1 text-sm text-[var(--admin-fg-muted)]">{children}</div>
        )}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Definition list — the "here are the facts" block on a detail page
--------------------------------------------------------------------------- */

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
      <dt className="text-sm text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[var(--admin-fg)]">
        {children}
      </dd>
    </div>
  );
}
