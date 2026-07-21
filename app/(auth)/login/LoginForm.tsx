"use client";

import { useActionState } from "react";

import { login, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@kpve.com"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold focus:ring-2 focus:ring-gold/25"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-white">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••••••"
          className="rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold focus:ring-2 focus:ring-gold/25"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gold-gradient px-6 py-3.5 text-sm font-medium text-black shadow-[0_10px_30px_-8px_rgba(189,139,40,0.6)] transition-all duration-300 hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
      >
        {pending && (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-black/70 border-t-transparent"
          />
        )}
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
