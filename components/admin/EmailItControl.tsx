"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  emailFlowInitial,
  type EmailFlowState,
} from "@/lib/email/flow";

/* ---------------------------------------------------------------------------
   "Email it" — the whole flow, once, for every button that sends a client mail.

   Press it and nothing is sent: the server renders the mail and hands it back,
   and the panel shows the real thing — the actual HTML, in an iframe, at the
   address it will actually go to. Send it goes; Cancel closes and nothing has
   happened either way.

   The confirm step is not ceremony. These mails are invoices and requests for
   money, they go to a client rather than to us, and there is no unsend. A press
   that costs one extra click buys the chance to notice the wrong client, the
   wrong amount or the wrong recurrence while it is still a draft.

   The preview is rendered in a sandboxed iframe. The HTML came from our own
   template so it is not hostile, but it IS a whole document with its own <html>
   and <body> — dropping that into the admin page would put a second document
   inside the first and let its styles loose on the dashboard. The iframe is
   what keeps the preview honest, too: it is the mail's own layout, not the
   admin's idea of it.
--------------------------------------------------------------------------- */

export type EmailAction = (
  prev: EmailFlowState,
  formData: FormData,
) => Promise<EmailFlowState>;

export function EmailItControl({
  previewAction,
  sendAction,
  fields,
  className,
  label = "Email it",
  /** What the mail is, for the panel's heading. "invoice INV-0042" reads well. */
  describes,
}: {
  previewAction: EmailAction;
  sendAction: EmailAction;
  /** Hidden inputs both actions receive — an id, never the content itself. */
  fields: Record<string, string>;
  className: string;
  label?: string;
  describes: string;
}) {
  const [preview, previewFormAction, previewPending] = useActionState(
    previewAction,
    emailFlowInitial,
  );
  const [sent, sendFormAction, sendPending] = useActionState(
    sendAction,
    emailFlowInitial,
  );
  // Closing is local: the preview state belongs to the action and can't be
  // cleared, so this is what decides whether the panel is on screen.
  const [dismissed, setDismissed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel replaces nothing, so focus doesn't move on its own — but it holds
  // the only two buttons that matter once it is up, and a keyboard user is
  // still back on "Email it". Move them to it when it appears.
  const open = Boolean(preview.preview) && !dismissed && !sent.delivery?.sent;
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const delivery = sent.delivery;
  const failed = delivery && !delivery.sent;

  return (
    <>
      {/* Press one: render it. Nothing leaves the building. */}
      <form
        action={previewFormAction}
        className="inline-flex"
        onSubmit={() => setDismissed(false)}
      >
        <HiddenFields fields={fields} />
        <button type="submit" disabled={previewPending} className={className}>
          {previewPending ? "Opening…" : delivery?.sent ? "Send again" : label}
        </button>
      </form>

      {/* Press two, and the only one that sends. */}
      {open && preview.preview && (
        <div
          ref={panelRef}
          tabIndex={-1}
          className="mt-2 flex w-full flex-col gap-3 rounded-lg border border-[var(--admin-accent)]/40 bg-[var(--admin-surface-2)] px-3 py-3 outline-none"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              Send {describes}?
            </p>
            <p className="mt-1 truncate text-sm text-[var(--admin-fg)]">
              To <strong className="font-semibold">{preview.preview.to}</strong>
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--admin-fg-muted)]">
              {preview.preview.subject}
            </p>
          </div>

          {/* sandbox="" is the strictest setting there is: no scripts, no forms,
              no navigation. A preview should render and do nothing else. */}
          <iframe
            title={`Preview — ${preview.preview.subject}`}
            srcDoc={preview.preview.html}
            sandbox=""
            className="h-[420px] w-full rounded-md border border-[var(--admin-border)] bg-black"
          />

          <div className="flex flex-wrap items-center gap-2">
            <form action={sendFormAction} className="inline-flex">
              <HiddenFields fields={fields} />
              <button
                type="submit"
                disabled={sendPending}
                className="rounded-lg bg-[var(--admin-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110 disabled:opacity-60"
              >
                {sendPending ? "Sending…" : "Send it"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
            >
              Cancel
            </button>
            <p className="text-[11px] text-[var(--admin-fg-subtle)]">
              Nothing has been sent yet.
            </p>
          </div>

          {failed && <FailureLine delivery={delivery} error={sent.error} />}
        </div>
      )}

      {/* The result, once it is out of the panel's hands. */}
      {(preview.error || delivery?.sent || (failed && !open)) && (
        <p
          role="status"
          className={`mt-1 w-full text-[11px] leading-relaxed ${
            delivery?.sent
              ? "text-[var(--admin-fg-muted)]"
              : "text-[var(--admin-warning,#c2853a)]"
          }`}
        >
          {preview.error
            ? preview.error
            : delivery?.sent
              ? `Emailed to ${delivery.to}.`
              : null}
          {!preview.error && failed && !open && (
            <FailureLine delivery={delivery} error={sent.error} />
          )}
        </p>
      )}
    </>
  );
}

/** Why it didn't go, in the words the case deserves. */
function FailureLine({
  delivery,
  error,
}: {
  delivery?: EmailFlowState["delivery"];
  error: string | null;
}) {
  return (
    <span className="text-[11px] leading-relaxed text-[var(--admin-warning,#c2853a)]">
      {error
        ? error
        : delivery?.reason === "not_configured"
          ? "Not sent — no mail server is configured here."
          : "Couldn't send it just then. Try again."}
    </span>
  );
}

function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
