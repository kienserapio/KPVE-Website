"use client";

import { useActionState } from "react";

import { portalLogin, type PortalLoginState } from "@/lib/actions/portal-auth";
import { AdminButton, AdminInput, AdminLabel } from "@/components/admin/ui";

const initialState: PortalLoginState = { error: null };

export function PortalLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(portalLogin, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <AdminLabel htmlFor="portal-email">Email</AdminLabel>
        <AdminInput
          id="portal-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@yourbusiness.com.au"
        />
      </div>

      <div>
        <AdminLabel htmlFor="portal-code">Access code</AdminLabel>
        <AdminInput
          id="portal-code"
          name="code"
          type="text"
          required
          /* Not a password: it is read off a note or an email and typed in, and
             hiding it only produces typos in something nobody has memorised. */
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="KM4P-8T2X-9WQR-3FHV-6BNY-J57Z"
          className="font-mono tracking-wide uppercase placeholder:normal-case"
        />
        <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
          Dashes, spaces and capitals don&rsquo;t matter.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"
        >
          {state.error}
        </p>
      )}

      <AdminButton type="submit" loading={pending} className="mt-1">
        {pending ? "Signing in" : "Sign in"}
      </AdminButton>
    </form>
  );
}
