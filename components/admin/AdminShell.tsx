"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { cn, initials } from "@/lib/utils";
import { logout } from "@/lib/actions/auth";
import { setThemeAction } from "@/lib/actions/leads";
import type { SessionStaff } from "@/lib/dal/session";

const NAV = [
  { href: "/admin", label: "Enquiries", exact: true },
  { href: "/admin/clients", label: "Clients", exact: false },
  { href: "/admin/activity", label: "Activity", exact: false },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className="size-8 object-contain" />
      <span className="font-semibold tracking-tight">KPVE</span>
      <span className="rounded-full bg-[var(--admin-surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        CRM
      </span>
    </Link>
  );
}

export function AdminShell({
  staff,
  theme,
  children,
}: {
  staff: SessionStaff;
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleTheme() {
    startTransition(() => {
      setThemeAction(theme === "light" ? "dark" : "light");
    });
  }

  const [first = "K", last = ""] = staff.name.split(" ");
  const nextTheme = theme === "light" ? "dark" : "light";

  function isActive(item: (typeof NAV)[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  const navLinkClass = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-2 text-sm font-medium transition",
      active
        ? "bg-[var(--admin-surface-2)] text-[var(--admin-fg)]"
        : "text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]",
    );

  const themeButton = (
    <button
      onClick={toggleTheme}
      disabled={pending}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      className="rounded-lg border border-[var(--admin-border)] p-2 text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] disabled:opacity-50"
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );

  const accountBlock = (
    <>
      <div className="flex items-center gap-3 px-2 py-2">
        <span
          title={staff.email}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--admin-accent)] text-xs font-semibold text-[var(--admin-accent-fg)]"
        >
          {initials(first, last)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{staff.name}</p>
          <p className="truncate text-xs leading-tight text-[var(--admin-fg-subtle)]">
            {staff.email}
          </p>
        </div>
      </div>
      <form action={logout}>
        <button
          type="submit"
          className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
        >
          Sign out
        </button>
      </form>
    </>
  );

  return (
    <div
      data-theme={theme}
      className="min-h-screen w-full bg-[var(--admin-bg)] text-[var(--admin-fg)]"
    >
      {/* ---------- Desktop sidebar (lg and up) ----------
          Fixed and flush to the viewport edge; the content column below is
          offset by the same width with lg:pl-64. No centering wrapper, so the
          layout stays full-bleed on wide screens. */}
      <aside className="hidden border-r border-[var(--admin-border)] bg-[var(--admin-surface)] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        <div className="flex h-16 items-center border-b border-[var(--admin-border)] px-5">
          <Brand />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={navLinkClass(isActive(item))}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
          >
            View website ↗
          </Link>
        </nav>

        <div className="border-t border-[var(--admin-border)] p-3">{accountBlock}</div>
      </aside>

      {/* ---------- Mobile navbar (below lg) ---------- */}
      <header className="sticky top-0 z-40 w-full border-b border-[var(--admin-border)] bg-[var(--admin-surface)] lg:hidden">
        <div className="flex h-16 w-full items-center gap-2 px-4">
          <Brand />
          <div className="ml-auto flex items-center gap-2">
            {themeButton}
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="rounded-lg border border-[var(--admin-border)] p-2 text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
                {menuOpen ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-[var(--admin-border)] px-4 py-3">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={navLinkClass(isActive(item))}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
              >
                View website ↗
              </Link>
            </div>
            <div className="mt-3 border-t border-[var(--admin-border)] pt-2">
              {accountBlock}
            </div>
          </nav>
        )}
      </header>

      {/* ---------- Content ---------- */}
      <div className="lg:pl-64">
        {/* Desktop top bar — the sidebar has no room for the theme toggle. */}
        <header className="sticky top-0 z-20 hidden h-16 items-center border-b border-[var(--admin-border)] bg-[var(--admin-bg)]/90 px-6 backdrop-blur lg:flex">
          <div className="ml-auto">{themeButton}</div>
        </header>

        <main className="w-full px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
