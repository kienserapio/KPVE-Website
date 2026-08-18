import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type {
  LeadStatus,
  ServiceCategory,
  Priority,
  ClientStatus,
  ClientType,
  ClientUserStatus,
  ClientServiceStatus,
  PaymentStatus,
  InvoiceStatus,
  NoteKind,
  DocumentKind,
} from "@/lib/db/schema";

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
   Badges

   Colour comes from CSS vars defined per theme in globals.css, so a badge stays
   legible on both the light and dark admin surfaces. Tailwind's `dark:` variant
   is not usable here — the admin theme is driven by `data-theme`.
--------------------------------------------------------------------------- */

/** The shared colour-pill every status/priority badge is built from. */
function ColorPill({ label, colorVar }: { label: string; colorVar: string }) {
  const color = `var(${colorVar})`;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        ["--tw-ring-color" as string]: `color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

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
  return <ColorPill label={STATUS_LABELS[status]} colorVar={STATUS_VAR[status]} />;
}

/* ---- Service category ("what they want") ---- */

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  general: "General",
  design: "Design",
  web_development: "Web Development",
  hosting: "Hosting",
  support: "Support",
  business: "Business",
  media: "Media",
  social_media: "Social Media",
};

/** All eight, in display order — for filter bars and selects. */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  "general",
  "design",
  "web_development",
  "hosting",
  "support",
  "business",
  "media",
  "social_media",
];

/**
 * Category is a neutral tag, not a colour — eight coloured hues would turn the
 * table into a rainbow and drown the signal from status and priority. A subtle
 * outlined chip reads as metadata, which is what a category is.
 */
export function CategoryBadge({ category }: { category: ServiceCategory }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--admin-fg-muted)]">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/* ---- Priority ---- */

const PRIORITY_VAR: Record<Priority, string> = {
  high: "--pr-high-fg",
  medium: "--pr-medium-fg",
  low: "--pr-low-fg",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITIES: Priority[] = ["high", "medium", "low"];

/** A coloured dot + label — compact enough to sit inline in a dense table. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const color = `var(${PRIORITY_VAR[priority]})`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--admin-fg-muted)]">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/* ---- Client status ---- */

const CLIENT_STATUS_VAR: Record<ClientStatus, string> = {
  prospect: "--cs-prospect-fg",
  active: "--cs-active-fg",
  on_hold: "--cs-on-hold-fg",
  completed: "--cs-completed-fg",
  churned: "--cs-churned-fg",
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  prospect: "Prospect",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  churned: "Churned",
};

export const CLIENT_STATUSES: ClientStatus[] = [
  "prospect",
  "active",
  "on_hold",
  "completed",
  "churned",
];

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <ColorPill label={CLIENT_STATUS_LABELS[status]} colorVar={CLIENT_STATUS_VAR[status]} />;
}

/* ---- Client type (person or business) ---- */

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  individual: "Individual",
  company: "Company",
};

export const CLIENT_TYPES: ClientType[] = ["individual", "company"];

/**
 * Deliberately the neutral outlined chip rather than a colour pill: type is a
 * fact about the record, not a state that needs watching, and it sits inches
 * from a status badge that does. Two coloured pills side by side and neither
 * one reads.
 */
export function ClientTypeBadge({ type }: { type: ClientType }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--admin-fg-muted)]">
      {CLIENT_TYPE_LABELS[type]}
    </span>
  );
}

/* ---- Billable service status ---- */

const SERVICE_STATUS_VAR: Record<ClientServiceStatus, string> = {
  draft: "--svc-draft-fg",
  pending_payment: "--svc-pending-fg",
  active: "--svc-active-fg",
  paused: "--svc-paused-fg",
  cancelled: "--svc-cancelled-fg",
};

export const SERVICE_STATUS_LABELS: Record<ClientServiceStatus, string> = {
  draft: "Draft",
  pending_payment: "Awaiting payment",
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

export const SERVICE_STATUSES: ClientServiceStatus[] = [
  "draft",
  "pending_payment",
  "active",
  "paused",
  "cancelled",
];

export function ServiceStatusBadge({ status }: { status: ClientServiceStatus }) {
  return <ColorPill label={SERVICE_STATUS_LABELS[status]} colorVar={SERVICE_STATUS_VAR[status]} />;
}

/* ---- Portal access ----
   Reuses the billing hues again: an active login reads the same green as an
   active service, an issued-but-unused code the same amber as an unpaid one,
   and a withdrawn login the same grey as a cancelled line.

   Being LOCKED OUT is not in here on purpose. It is transient, it does not
   change what the login is, and a locked active user is still active — a fourth
   pill would put two coloured pills on one row and neither would read. It is a
   chip on the row instead. */

const PORTAL_ACCESS_VAR: Record<ClientUserStatus, string> = {
  invited: "--svc-pending-fg",
  active: "--svc-active-fg",
  disabled: "--svc-cancelled-fg",
};

export const PORTAL_ACCESS_LABELS: Record<ClientUserStatus, string> = {
  invited: "Not used yet",
  active: "Active",
  disabled: "Disabled",
};

export function PortalAccessBadge({ status }: { status: ClientUserStatus }) {
  return <ColorPill label={PORTAL_ACCESS_LABELS[status]} colorVar={PORTAL_ACCESS_VAR[status]} />;
}

/* ---- Payment status ----
   Reuses the billing-status hues rather than inventing a second palette: a
   succeeded payment and an active service mean the same thing to the eye. */

const PAYMENT_STATUS_VAR: Record<PaymentStatus, string> = {
  pending: "--svc-pending-fg",
  succeeded: "--svc-active-fg",
  failed: "--pr-high-fg",
  refunded: "--svc-draft-fg",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  succeeded: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <ColorPill label={PAYMENT_STATUS_LABELS[status]} colorVar={PAYMENT_STATUS_VAR[status]} />;
}

/* ---- Invoice status ----
   Draft is a neutral outlined chip (it isn't a document yet); the rest reuse the
   billing hues so "paid" reads the same green as an active service and a
   succeeded payment. Void is muted — it's a record that no longer counts. */

const INVOICE_STATUS_VAR: Record<InvoiceStatus, string> = {
  draft: "--svc-draft-fg",
  sent: "--svc-pending-fg",
  paid: "--svc-active-fg",
  void: "--svc-cancelled-fg",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "void"];

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <ColorPill label={INVOICE_STATUS_LABELS[status]} colorVar={INVOICE_STATUS_VAR[status]} />;
}

/* ---- Timeline entries and documents ---- */

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  milestone: "Milestone",
};

export const NOTE_KINDS: NoteKind[] = ["note", "call", "meeting", "email", "milestone"];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  contract: "Contract",
  proposal: "Proposal",
  brief: "Brief",
  invoice: "Invoice",
  asset: "Asset",
  other: "Other",
};

export const DOCUMENT_KINDS: DocumentKind[] = [
  "contract",
  "proposal",
  "brief",
  "invoice",
  "asset",
  "other",
];

/** A neutral outlined chip — same reasoning as CategoryBadge. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--admin-fg-muted)]">
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Money

   Amounts are always tabular-nums and right-alignable: a column of prices that
   doesn't line up on the decimal is a column you have to read twice.
--------------------------------------------------------------------------- */

export function Money({
  children,
  className,
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        muted ? "text-[var(--admin-fg-muted)]" : "text-[var(--admin-fg)]",
        className,
      )}
    >
      {children}
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
