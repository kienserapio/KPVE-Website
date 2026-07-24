"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ClientStatus, ClientType, ServiceCategory } from "@/lib/db/schema";
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPES,
  CATEGORY_LABELS,
  SERVICE_CATEGORIES,
} from "./ui";

const filterSelectClass =
  "rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2 text-sm font-normal text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

export function ClientFilters({
  currentStatus,
  currentCategory,
  currentType,
  currentQuery,
  counts,
  totalCount,
}: {
  currentStatus?: ClientStatus;
  currentCategory?: ServiceCategory;
  currentType?: ClientType;
  currentQuery: string;
  counts: Record<ClientStatus, number>;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(currentQuery);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      params.delete("page");
      router.replace(`/admin/clients?${params.toString()}`);
    }, 350);
    return () => clearTimeout(timeout);
  }, [query, router, searchParams]);

  function statusHref(status?: ClientStatus) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (currentCategory) params.set("category", currentCategory);
    if (currentType) params.set("type", currentType);
    if (currentQuery) params.set("q", currentQuery);
    const qs = params.toString();
    return qs ? `/admin/clients?${qs}` : "/admin/clients";
  }

  /** Every select filter behaves the same way: set or clear, then reset paging. */
  function onSelectChange(key: "category" | "type", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`/admin/clients?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPill href={statusHref()} active={!currentStatus} count={totalCount}>
          All
        </FilterPill>
        {CLIENT_STATUSES.map((status) => (
          <FilterPill
            key={status}
            href={statusHref(status)}
            active={currentStatus === status}
            count={counts[status]}
          >
            {CLIENT_STATUS_LABELS[status]}
          </FilterPill>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--admin-fg-subtle)]">
            <span className="uppercase tracking-wider">Category</span>
            <select
              value={currentCategory ?? ""}
              onChange={(e) => onSelectChange("category", e.target.value)}
              aria-label="Filter by category"
              className={filterSelectClass}
            >
              <option value="">All categories</option>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium text-[var(--admin-fg-subtle)]">
            <span className="uppercase tracking-wider">Type</span>
            <select
              value={currentType ?? ""}
              onChange={(e) => onSelectChange("type", e.target.value)}
              aria-label="Filter by client type"
              className={filterSelectClass}
            >
              <option value="">People and businesses</option>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="relative sm:w-72">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company or email"
            aria-label="Search clients"
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
