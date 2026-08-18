"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  issuePortalAccessAction,
  reissuePortalCodeAction,
  removePortalAccessAction,
  setPortalAccessAction,
  unlockPortalAccessAction,
  type PortalAccessState,
} from "@/lib/actions/portal-access";
import type { PortalUserItem } from "@/lib/dal/portal-access";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  Chip,
  PortalAccessBadge,
} from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Who can sign in to the client portal for this client, and the buttons that
   change that.

   The code a staff member issues is shown exactly once, in the panel that
   appears when they press the button. It is not stored in readable form and not
   re-fetchable, so the panel carries that warning and every reissue is a fresh
   code — the same contract as any API key.
--------------------------------------------------------------------------- */

const initialState: PortalAccessState = { ok: false, error: null };

export function ClientPortalAccess({
  clientId,
  users,
}: {
  clientId: string;
  users: PortalUserItem[];
}) {
  // With nobody invited yet, the form is the point of the panel — show it.
  const [adding, setAdding] = useState(users.length === 0);

  return (
    <div className="flex flex-col gap-4">
      {users.length === 0 ? (
        <p className="text-sm text-[var(--admin-fg-muted)]">
          Nobody can sign in yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
          {users.map((user) => (
            <PortalUserRow key={user.id} user={user} />
          ))}
        </ul>
      )}

      {adding ? (
        // Unmounting on close is the reset — the next form starts empty.
        <InviteForm
          clientId={clientId}
          dismissible={users.length > 0}
          onDone={() => setAdding(false)}
        />
      ) : (
        <div>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => setAdding(true)}
          >
            + Give someone access
          </AdminButton>
        </div>
      )}
    </div>
  );
}

function PortalUserRow({ user }: { user: PortalUserItem }) {
  const [state, formAction, pending] = useActionState(
    reissuePortalCodeAction,
    initialState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setPortalAccessAction,
    initialState,
  );
  const [confirmingReissue, setConfirmingReissue] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  /**
   * Which code has already been dismissed, not merely "one was".
   *
   * A boolean latches: this row is never unmounted (it is keyed by id, and the
   * revalidate after an action reconciles it rather than replacing it), so a
   * second reissue would mint a code, kill the client's working one, and then
   * be swallowed by a flag left true from the first. Comparing the object
   * identity of the result instead means every new result shows.
   */
  const [dismissedIssue, setDismissedIssue] =
    useState<PortalAccessState["issued"]>(undefined);

  // The panel replaces the row's controls while it is up: a code on screen is
  // the one thing on this card that cannot be recovered by pressing the button
  // again, so nothing else competes with it.
  const issued =
    state.ok && state.issued !== dismissedIssue ? state.issued : undefined;

  const neverSignedIn = user.lastLoginAt === null;
  const disabled = user.status === "disabled";

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--admin-fg)]">
            {user.name}
          </p>
          <p className="truncate text-xs text-[var(--admin-fg-muted)]">{user.email}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PortalAccessBadge status={user.status} />

            {user.isLocked && (
              <span className="text-xs font-medium text-red-500">
                Locked out — too many wrong codes
              </span>
            )}

            {!user.hasCode && !disabled && <Chip>No code</Chip>}
            {user.hasCode && user.isExpired && <Chip>Code expired</Chip>}

            <span className="text-xs text-[var(--admin-fg-subtle)]">
              {user.lastLoginAt
                ? `Last signed in ${formatDate(user.lastLoginAt)}`
                : "Never signed in"}
              {user.hasCode && !user.isExpired && user.codeExpiresAt
                ? ` · code good until ${formatDate(user.codeExpiresAt)}`
                : ""}
              {user.invitedByName ? ` · added by ${user.invitedByName}` : ""}
            </span>
          </div>
        </div>

        {!issued && (
          <div className="flex flex-wrap items-center gap-2">
            {user.isLocked && (
              <form action={unlockPortalAccessAction}>
                <input type="hidden" name="clientUserId" value={user.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
                >
                  Unlock
                </button>
              </form>
            )}

            {!disabled && !confirmingReissue && (
              <button
                type="button"
                onClick={() => setConfirmingReissue(true)}
                className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
              >
                {user.hasCode ? "New code" : "Issue code"}
              </button>
            )}

            <form action={statusAction}>
              <input type="hidden" name="clientUserId" value={user.id} />
              <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
              <button
                type="submit"
                disabled={statusPending}
                className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] disabled:pointer-events-none disabled:opacity-60"
              >
                {statusPending
                  ? disabled
                    ? "Turning on"
                    : "Disabling"
                  : disabled
                    ? "Turn back on"
                    : "Disable"}
              </button>
            </form>

            {statusState.error && (
              <span role="alert" className="text-xs text-red-500">
                {statusState.error}
              </span>
            )}

            {/* Only offered before a first sign-in. After that the row is what
                the activity log resolves their name from, so access is
                withdrawn by disabling instead. */}
            {neverSignedIn &&
              (confirmingRemove ? (
                <form
                  action={removePortalAccessAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="clientUserId" value={user.id} />
                  <button
                    type="submit"
                    className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  aria-label={`Remove ${user.email}`}
                  className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-4"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              ))}
          </div>
        )}
      </div>

      {confirmingReissue && !issued && (
        <form
          action={formAction}
          className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 py-3"
        >
          <input type="hidden" name="clientUserId" value={user.id} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            {user.hasCode ? "This replaces their code" : "This issues a code"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--admin-fg-muted)]">
            {user.hasCode
              ? "The code they have now stops working, and if they are signed in anywhere they are signed out. The new one is shown once, here."
              : "The code is shown once, here. It cannot be looked up afterwards — only replaced."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--admin-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
            >
              {pending ? "Generating" : user.hasCode ? "Generate a new code" : "Generate code"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReissue(false)}
              className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
            >
              Cancel
            </button>
            {state.error && (
              <span role="alert" className="text-xs text-red-500">
                {state.error}
              </span>
            )}
          </div>
        </form>
      )}

      {issued && (
        <IssuedCodePanel
          issued={issued}
          onDone={() => {
            setDismissedIssue(state.issued);
            setConfirmingReissue(false);
          }}
        />
      )}
    </li>
  );
}

function InviteForm({
  clientId,
  dismissible,
  onDone,
}: {
  clientId: string;
  dismissible: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    issuePortalAccessAction,
    initialState,
  );
  const [dismissed, setDismissed] = useState(false);

  const issued = state.ok && !dismissed ? state.issued : undefined;

  // Deliberately NOT the usual "close the form when it succeeds" effect: the
  // code is in the state this form owns, and closing would take it off screen
  // before anyone had copied it.
  if (issued) {
    return (
      <IssuedCodePanel
        issued={issued}
        onDone={() => {
          setDismissed(true);
          onDone();
        }}
      />
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="portal-user-name">Name</AdminLabel>
          <AdminInput
            id="portal-user-name"
            name="name"
            required
            placeholder="e.g. Dimitrios Kappatos"
          />
        </div>
        <div>
          <AdminLabel htmlFor="portal-user-email">Email</AdminLabel>
          <AdminInput
            id="portal-user-email"
            name="email"
            required
            type="email"
            placeholder="them@theirbusiness.com.au"
          />
        </div>
      </div>

      <p className="text-xs text-[var(--admin-fg-subtle)]">
        This email is half of how they sign in, so use the one they actually
        read. A second person on the same client gets their own — revoking one
        never touches the other.
      </p>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <AdminButton type="submit" loading={pending}>
          {pending ? "Creating" : "Create login"}
        </AdminButton>
        {dismissible && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function IssuedCodePanel({
  issued,
  onDone,
}: {
  issued: NonNullable<PortalAccessState["issued"]>;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel appears in place of a button that has just been pressed, so a
  // keyboard or screen-reader user is left where the button was — on an element
  // that no longer exists. role="status" announces it; the focus move puts them
  // on the thing they asked for.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // No beforeunload guard, deliberately. This panel is the only copy of the
  // code, so warning before a navigation is tempting — but it can only be done
  // with the browser's own "Leave site?" dialog, which blocks every navigation
  // while the panel is up and cannot be worded. The panel says what it is, and
  // a lost code is one button away from being replaced.

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The code
      // is on screen and selectable, so this needs no error state of its own.
    }
  }

  // The origin is only knowable in the browser; reading it during render would
  // mismatch the server HTML. So the mail is composed at click time.
  function emailIt() {
    const subject = "Your KPVE account";
    const body = [
      `Hi ${issued.name},`,
      "",
      "You can now see your services, invoices and payments with KPVE.",
      "",
      `Sign in: ${window.location.origin}/portal/login`,
      `Email: ${issued.email}`,
      `Access code: ${issued.code}`,
      "",
      "The code is case-insensitive and the dashes don't matter.",
    ].join("\n");

    window.location.href = `mailto:${encodeURIComponent(issued.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div
      ref={panelRef}
      role="status"
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-lg border border-[var(--admin-accent)]/40 bg-[var(--admin-surface-2)] px-3 py-3 outline-none"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        Access code for {issued.email} — shown once
      </p>

      <code className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-2 text-center text-sm font-medium tracking-wider text-[var(--admin-fg)] break-all">
        {issued.code}
      </code>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg bg-[var(--admin-accent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
        <button
          type="button"
          onClick={emailIt}
          className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
        >
          Email it
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          Done — I&rsquo;ve sent it
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--admin-fg-subtle)]">
        Only a hash of this is stored, so nobody — including us — can read it
        back. Good until {formatDate(issued.expiresAt)}; after that, or if it is
        lost, issue a new one. They sign in at /portal/login with their email and
        this code.
      </p>
    </div>
  );
}
