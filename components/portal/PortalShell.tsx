"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { cn, initials } from "@/lib/utils";
import { portalLogout } from "@/lib/actions/portal-auth";
import { setPortalThemeAction } from "@/lib/actions/portal-billing";
import type { SessionClient } from "@/lib/dal/portal-session";
import type { PortalTheme } from "@/lib/portal-theme";

/* ---------------------------------------------------------------------------
   The client's shell — the CRM's chrome, with the CRM's reach removed.

   Deliberately a TWIN of components/admin/AdminShell.tsx rather than a shared,
   parameterised version of it. The two look alike on purpose and that is
   exactly the trap: a single shell taking a `nav` prop and a `user` prop is one
   careless default away from rendering a staff link inside a client session, or
   from a client's name appearing where a staff member's should. The duplication
   is the boundary. If a link is not in the NAV array below, no client can reach
   it from the chrome at all.

   Nothing here decides authorization. Every page under this layout calls
   verifyPortalSession() for itself, because a layout does not re-render on
   navigation under Partial Rendering and so is not a gate.
--------------------------------------------------------------------------- */

function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px] shrink-0"
    >
      {children}
    </svg>
  );
}

function OverviewIcon() {
  return (
    <IconBase>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

function ServicesIcon() {
  return (
    <IconBase>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </IconBase>
  );
}

function InvoicesIcon() {
  return (
    <IconBase>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </IconBase>
  );
}

function PaymentsIcon() {
  return (
    <IconBase>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </IconBase>
  );
}

function ExternalIcon() {
  return (
    <IconBase>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </IconBase>
  );
}

/**
 * The whole surface a client can navigate to. Four entries, and every one of
 * them is a read of their own account.
 */
const NAV = [
  { href: "/portal", label: "Overview", exact: true, Icon: OverviewIcon },
  { href: "/portal/services", label: "Services", exact: false, Icon: ServicesIcon },
  { href: "/portal/invoices", label: "Invoices", exact: false, Icon: InvoicesIcon },
  { href: "/portal/payments", label: "Payments", exact: false, Icon: PaymentsIcon },
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
    <Link href="/portal" className="flex shrink-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#050505] ring-1 ring-inset ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="size-4 object-contain" />
      </span>
      <span className="font-semibold tracking-tight">KPVE</span>
      {/* "CRM" on the staff shell, "Account" here — one glance tells you which
          side of the wall you are on, which matters most to the staff member
          who has both open. */}
      <span className="rounded-full bg-[var(--admin-surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        Account
      </span>
    </Link>
  );
}

export function PortalShell({
  client,
  theme,
  /** Unpaid invoice count — a badge on Invoices, so money owed is visible from every page. */
  dueCount,
  children,
}: {
  client: SessionClient;
  theme: PortalTheme;
  dueCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleTheme() {
    startTransition(() => {
      setPortalThemeAction(theme === "light" ? "dark" : "light");
    });
  }

  const [first = "K", last = ""] = client.name.split(" ");
  const nextTheme = theme === "light" ? "dark" : "light";

  function isActive(item: (typeof NAV)[number]) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  const navLinkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
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

  const navItems = (onNavigate?: () => void) => (
    <>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(item) ? "page" : undefined}
          className={navLinkClass(isActive(item))}
        >
          <item.Icon />
          <span className="flex-1">{item.label}</span>
          {item.href === "/portal/invoices" && dueCount > 0 && (
            <span
              // Not a decoration: this is the only place an unpaid invoice is
              // visible from a page that isn't about invoices.
              aria-label={`${dueCount} unpaid`}
              className="rounded-full bg-[var(--svc-pending-fg)]/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--svc-pending-fg)]"
            >
              {dueCount}
            </span>
          )}
        </Link>
      ))}
      <Link
        href="/"
        onClick={onNavigate}
        className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
      >
        <ExternalIcon />
        KPVE website
      </Link>
    </>
  );

  const accountBlock = (
    <>
      <div className="flex items-center gap-3 px-2 py-2">
        <span
          title={client.email}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--admin-accent)] text-xs font-semibold text-[var(--admin-accent-fg)]"
        >
          {initials(first, last)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{client.name}</p>
          {/* The ACCOUNT, not the person — one individual can hold logins on
              several, and "which company am I looking at" is the question this
              answers. */}
          <p className="truncate text-xs leading-tight text-[var(--admin-fg-subtle)]">
            {client.clientName}
          </p>
        </div>
      </div>
      <form action={portalLogout}>
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
    // No `data-theme` here: app/(portal)/layout.tsx owns the only one on the
    // page, so the overscroll backdrop and the shell can never disagree.
    <div className="min-h-screen w-full bg-[var(--admin-bg)] text-[var(--admin-fg)]">
      {/* ---------- Desktop sidebar (lg and up) ---------- */}
      <aside className="hidden border-r border-[var(--admin-border)] bg-[var(--admin-surface)] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        <div className="flex h-16 items-center border-b border-[var(--admin-border)] px-5">
          <Brand />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">{navItems()}</nav>

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
            <div className="flex flex-col gap-1">{navItems(() => setMenuOpen(false))}</div>
            <div className="mt-3 border-t border-[var(--admin-border)] pt-2">
              {accountBlock}
            </div>
          </nav>
        )}
      </header>

      {/* ---------- Content ---------- */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 hidden h-16 items-center border-b border-[var(--admin-border)] bg-[var(--admin-bg)]/90 px-6 backdrop-blur lg:flex">
          <p className="truncate text-sm font-medium text-[var(--admin-fg-muted)]">
            {client.clientName}
          </p>
          <div className="ml-auto">{themeButton}</div>
        </header>

        <main className="w-full px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
