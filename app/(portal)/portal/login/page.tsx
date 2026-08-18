import type { Metadata } from "next";

import { PortalLoginForm } from "./PortalLoginForm";

export const metadata: Metadata = {
  title: "Sign in — KPVE",
  robots: { index: false, follow: false },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  // Repeating a query parameter hands back an array, and React would render
  // that into the hidden field as "a,b".
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = Array.isArray(rawNext) ? rawNext[0] : rawNext;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-xl font-semibold tracking-tight text-[var(--admin-fg)]">
            KPVE
          </span>
        </div>

        <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-6 shadow-[var(--admin-shadow)] sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--admin-fg)]">
            Your account
          </h1>
          <p className="mt-2 text-sm text-[var(--admin-fg-muted)]">
            Sign in with your email and the access code KPVE gave you.
          </p>

          <PortalLoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-[var(--admin-fg-subtle)]">
          Access codes are issued by KPVE. Lost yours? Get in touch and we&rsquo;ll
          send a new one — codes can be reissued, never looked up.
        </p>
      </div>
    </main>
  );
}
