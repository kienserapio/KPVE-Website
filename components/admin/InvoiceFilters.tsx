"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/db/schema";
import { INVOICE_STATUS_LABELS, INVOICE_STATUSES } from "./ui";

/* ---------------------------------------------------------------------------
   Status filter for /admin/invoices — the controlled-URL idiom from
   ClientFilters, pared to a row of pills. Status is the axis that matters here
   (draft vs sent vs overdue is the daily question); the client axis is set by
   arriving from a client page, not chosen here, so it only ever renders as a
   "clear" affordance when it's already in the URL.

   No count badges: getInvoiceStats() only knows draft/sent/overdue, not a count
   per pill, and a row where two pills carry a number and two don't reads as
   broken. Labels alone are honest.
--------------------------------------------------------------------------- */

export function InvoiceFilters({
  currentStatus,
  currentClient,
  currentClientName,
}: {
  currentStatus?: InvoiceStatus;
  currentClient?: string;
  currentClientName?: string;
}) {
  // Every pill keeps whatever client filter is in play — switching status must
  // not silently widen the view back to every client.
  function href(status?: InvoiceStatus) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (currentClient) params.set("client", currentClient);
    const qs = params.toString();
    return qs ? `/admin/invoices?${qs}` : "/admin/invoices";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPill href={href()} active={!currentStatus}>
          All
        </FilterPill>
        {INVOICE_STATUSES.map((status) => (
          <FilterPill
            key={status}
            href={href(status)}
            active={currentStatus === status}
          >
            {INVOICE_STATUS_LABELS[status]}
          </FilterPill>
        ))}
      </div>

      {currentClient && (
        <div className="flex items-center gap-2 text-xs text-[var(--admin-fg-subtle)]">
          <span>
            Showing invoices for{" "}
            <span className="font-medium text-[var(--admin-fg-muted)]">
              {currentClientName ?? "one client"}
            </span>
          </span>
          <Link
            href={currentStatus ? `/admin/invoices?status=${currentStatus}` : "/admin/invoices"}
            className="font-medium text-[var(--admin-accent)] hover:underline"
          >
            Clear
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
          : "border border-[var(--admin-border)] text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]",
      )}
    >
      {children}
    </Link>
  );
}
