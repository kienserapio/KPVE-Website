"use client";

import { useActionState, useEffect, useState } from "react";

import {
  addNoteAction,
  deleteNoteAction,
  type ClientActionState,
} from "@/lib/actions/clients";
import type { ClientNoteItem } from "@/lib/dal/notes";
import { formatDateTime } from "@/lib/utils";
import {
  AdminButton,
  AdminTextarea,
  Chip,
  NOTE_KIND_LABELS,
  NOTE_KINDS,
} from "./ui";

const initialState: ClientActionState = { ok: false, error: null };

const selectClass =
  "rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/* ---------------------------------------------------------------------------
   The relationship timeline: what was said, when, and by whom.

   Everything before this lived in one notes field that nobody dated. An entry
   here is a call, a meeting, an email or a plain note, and it keeps its own
   "when it happened" — separate from when it was typed up, because Friday's
   write-up of a Tuesday call is still a Tuesday call.
--------------------------------------------------------------------------- */

export function ClientNotes({
  clientId,
  entries,
}: {
  clientId: string;
  entries: ClientNoteItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {open ? (
        // Closing unmounts the form, so the next one starts empty with no reset.
        <NoteForm clientId={clientId} onDone={() => setOpen(false)} />
      ) : (
        <div>
          <AdminButton type="button" variant="secondary" onClick={() => setOpen(true)}>
            + Log a call, meeting or note
          </AdminButton>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--admin-fg-muted)]">
          Nothing logged yet. Every call and meeting recorded here is history
          the next person on this account gets for free.
        </p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => (
            <li key={entry.id} className="flex gap-3">
              {/* A rail down the left, joining the entries into one thread. */}
              <div className="flex flex-col items-center">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--admin-accent)]" />
                {index < entries.length - 1 && (
                  <span className="w-px flex-1 bg-[var(--admin-border)]" />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{NOTE_KIND_LABELS[entry.kind]}</Chip>
                  <span className="text-xs text-[var(--admin-fg-subtle)]">
                    {formatDateTime(entry.occurredAt)}
                  </span>
                  {entry.authorName && (
                    <span className="text-xs text-[var(--admin-fg-subtle)]">
                      · {entry.authorName}
                    </span>
                  )}
                  <form action={deleteNoteAction} className="ml-auto">
                    <input type="hidden" name="noteId" value={entry.id} />
                    <button
                      type="submit"
                      aria-label="Delete entry"
                      className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </form>
                </div>
                {/* whitespace-pre-line keeps typed line breaks without letting
                    anything in the string be interpreted as markup. */}
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--admin-fg)]">
                  {entry.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NoteForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(addNoteAction, initialState);

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <AdminTextarea
        name="body"
        required
        rows={3}
        placeholder="What happened? — e.g. Call with Dimitrios: wants hosting moved before the launch."
        aria-label="Entry"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="note-kind">
          Type
        </label>
        <select id="note-kind" name="kind" defaultValue="note" className={selectClass}>
          {NOTE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {NOTE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="note-occurred">
          When it happened
        </label>
        <input
          id="note-occurred"
          type="datetime-local"
          name="occurredAt"
          className={selectClass}
          title="Leave blank for now"
        />

        <AdminButton type="submit" loading={pending} className="ml-auto">
          {pending ? "Saving" : "Save entry"}
        </AdminButton>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          Cancel
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}
    </form>
  );
}
