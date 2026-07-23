"use client";

import { useActionState, useEffect, useState } from "react";

import {
  addDocumentAction,
  deleteDocumentAction,
  type ClientActionState,
} from "@/lib/actions/clients";
import type { ClientDocumentItem } from "@/lib/dal/documents";
import { formatDate } from "@/lib/utils";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  Chip,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_KINDS,
} from "./ui";

const initialState: ClientActionState = { ok: false, error: null };

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/* ---------------------------------------------------------------------------
   Documents — links to the contract, the brief, the signed quote.

   Links rather than uploads on purpose: the team works out of Drive already,
   and a second copy stored here would be the stale one within a week.
--------------------------------------------------------------------------- */

export function ClientDocuments({
  clientId,
  documents,
}: {
  clientId: string;
  documents: ClientDocumentItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {documents.length === 0 ? (
        <p className="text-sm text-[var(--admin-fg-muted)]">
          No documents linked yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start gap-3 py-2.5 first:pt-0">
              <div className="min-w-0 flex-1">
                <a
                  href={doc.url}
                  target="_blank"
                  // noreferrer as well as noopener: the target page has no
                  // business knowing which CRM record linked to it.
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-[var(--admin-accent)] hover:underline"
                >
                  {doc.label}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <Chip>{DOCUMENT_KIND_LABELS[doc.kind]}</Chip>
                  <span className="text-xs text-[var(--admin-fg-subtle)]">
                    {formatDate(doc.createdAt)}
                    {doc.addedByName ? ` · ${doc.addedByName}` : ""}
                  </span>
                </div>
              </div>

              <form action={deleteDocumentAction}>
                <input type="hidden" name="documentId" value={doc.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${doc.label}`}
                  className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        // Unmounting on close is the reset — the next form starts empty.
        <DocumentForm clientId={clientId} onDone={() => setOpen(false)} />
      ) : (
        <div>
          <AdminButton type="button" variant="secondary" onClick={() => setOpen(true)}>
            + Link a document
          </AdminButton>
        </div>
      )}
    </div>
  );
}

function DocumentForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(addDocumentAction, initialState);

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

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="doc-label">Name</AdminLabel>
          <AdminInput
            id="doc-label"
            name="label"
            required
            placeholder="e.g. Signed retainer"
          />
        </div>
        <div>
          <AdminLabel htmlFor="doc-kind">Type</AdminLabel>
          <select id="doc-kind" name="kind" defaultValue="contract" className={selectClass}>
            {DOCUMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {DOCUMENT_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <AdminLabel htmlFor="doc-url">Link</AdminLabel>
        <AdminInput
          id="doc-url"
          name="url"
          required
          type="url"
          inputMode="url"
          placeholder="https://drive.google.com/…"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <AdminButton type="submit" loading={pending}>
          {pending ? "Saving" : "Add document"}
        </AdminButton>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
