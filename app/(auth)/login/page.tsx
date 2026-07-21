import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — KPVE",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 bottom-[-25%] h-[70%] bg-[radial-gradient(60%_100%_at_50%_100%,rgba(189,139,40,0.12),transparent)]" />
        <div className="bg-grid mask-fade-y absolute inset-0 opacity-20" />
      </div>

      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KPVE" className="size-11 object-contain" />
          <span className="text-xl font-semibold tracking-tight text-white">KPVE</span>
        </Link>

        <div className="card-dots rounded-[24px] border border-line-3 bg-gradient-to-b from-white/[0.05] to-transparent p-8">
          <h1 className="text-2xl font-medium text-white">
            Client <span className="text-gold-gradient">Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to manage enquiries.
          </p>

          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-2">
          Staff access only. Accounts are created by KPVE administrators.
        </p>
      </div>
    </main>
  );
}
