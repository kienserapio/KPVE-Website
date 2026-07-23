import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
   The frame every /pay page sits in.

   Deliberately plain and client-facing: this is the one page in the CRM a
   customer sees, so it carries the brand mark and nothing else — no nav, no
   footer, no link back into the site to lose them on.
--------------------------------------------------------------------------- */

export function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-surface ring-1 ring-inset ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="size-4 object-contain" />
          </span>
          <span className="font-sora text-lg font-semibold tracking-tight text-white">
            KPVE
          </span>
        </Link>

        <div className="rounded-2xl border border-line-2 bg-surface p-6 shadow-2xl sm:p-8">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Questions about this payment? Reply to the email it came from.
        </p>
      </div>
    </main>
  );
}
