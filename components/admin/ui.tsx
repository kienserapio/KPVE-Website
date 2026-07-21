import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/db/schema";

/* ---------------------------------------------------------------------------
   Surfaces
--------------------------------------------------------------------------- */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-shadow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums",
          accent ? "text-[var(--admin-accent)]" : "text-[var(--admin-fg)]",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--admin-fg-muted)]">{hint}</p>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Status badge
--------------------------------------------------------------------------- */

/**
 * Colour comes from CSS vars defined per theme in globals.css, so the badge
 * stays legible on both the light and dark admin surfaces. Tailwind's `dark:`
 * variant is not usable here — the admin theme is driven by `data-theme`.
 */
const STATUS_VAR: Record<LeadStatus, string> = {
  new: "--st-new-fg",
  contacted: "--st-contacted-fg",
  qualified: "--st-qualified-fg",
  converted: "--st-converted-fg",
  archived: "--st-archived-fg",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const color = `var(${STATUS_VAR[status]})`;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        ["--tw-ring-color" as string]: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Table
--------------------------------------------------------------------------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[var(--admin-border)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-[var(--admin-border)] px-4 py-3 align-middle text-[var(--admin-fg)]",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ---------------------------------------------------------------------------
   Empty state
--------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-base font-medium text-[var(--admin-fg)]">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-[var(--admin-fg-muted)]">{description}</p>
      )}
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Form controls
--------------------------------------------------------------------------- */

const controlClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition placeholder:text-[var(--admin-fg-subtle)] focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25 disabled:opacity-60";

export function AdminInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, className)} />;
}

export function AdminTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, "resize-y", className)} />;
}

export function AdminLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]"
    >
      {children}
    </label>
  );
}

export function AdminButton({
  children,
  variant = "primary",
  className,
  loading = false,
  disabled,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary:
      "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)] hover:brightness-110",
    secondary:
      "border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-fg)] hover:bg-[var(--admin-surface-2)]",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]/50 disabled:pointer-events-none disabled:opacity-55",
        variants[variant],
        className,
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      )}
      {children}
    </button>
  );
}
