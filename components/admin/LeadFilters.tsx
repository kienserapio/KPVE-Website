"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { LeadStatus, ServiceCategory } from "@/lib/db/schema";
import { STATUS_LABELS, CATEGORY_LABELS, SERVICE_CATEGORIES } from "./ui";

const STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
];

export function LeadFilters({
  currentStatus,
  currentCategory,
  currentQuery,
  counts,
  totalCount,
}: {
  currentStatus?: LeadStatus;
  currentCategory?: ServiceCategory;
  currentQuery: string;
  counts: Record<LeadStatus, number>;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);
  const isFirstRender = useRef(true);

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      params.delete("page"); // a new search always starts at page 1
      router.replace(`/admin/enquiries?${params.toString()}`);
    }, 350);

    return () => clearTimeout(timeout);
  }, [query, router, searchParams]);

  function statusHref(status?: LeadStatus) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (currentCategory) params.set("category", currentCategory);
    if (currentQuery) params.set("q", currentQuery);
    const qs = params.toString();
    return qs ? `/admin/enquiries?${qs}` : "/admin/enquiries";
  }

  function onCategoryChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("category", value);
    else params.delete("category");
    params.delete("page");
    router.replace(`/admin/enquiries?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPill href={statusHref()} active={!currentStatus} count={totalCount}>
          All
        </FilterPill>
        {STATUSES.map((status) => (
          <FilterPill
            key={status}
            href={statusHref(status)}
            active={currentStatus === status}
            count={counts[status]}
          >
            {STATUS_LABELS[status]}
          </FilterPill>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-xs font-medium text-[var(--admin-fg-subtle)]">
          <span className="uppercase tracking-wider">Category</span>
          <select
            value={currentCategory ?? ""}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by category"
            className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2 text-sm font-normal text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25"
          >
            <option value="">All categories</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <div className="relative sm:w-72">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or message"
            aria-label="Search enquiries"
            className="w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] py-2 pl-9 pr-3 text-sm text-[var(--admin-fg)] outline-none transition placeholder:text-[var(--admin-fg-subtle)] focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--admin-fg-subtle)]"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
          : "border border-[var(--admin-border)] text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]",
      )}
    >
      {children}
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>
        {count}
      </span>
    </Link>
  );
}
