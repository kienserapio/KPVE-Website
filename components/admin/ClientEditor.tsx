"use client";

import { useState } from "react";
import { useActionState } from "react";

import {
  updateClientAction,
  deleteClientAction,
  type ClientActionState,
} from "@/lib/actions/clients";
import type { ClientDetail } from "@/lib/dal/clients";
import type { StaffOption } from "@/lib/dal/staff";
import { AdminButton, Card } from "./ui";
import { ClientFields } from "./ClientFields";

const initialState: ClientActionState = { ok: false, error: null };

export function ClientEditor({
  client,
  staffOptions,
  parentOptions,
}: {
  client: ClientDetail;
  staffOptions: StaffOption[];
  /** Individual clients offered in the "Owned by" picker, this one excluded. */
  parentOptions?: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);
  const saved = state.ok && !pending;

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="clientId" value={client.id} />

        <ClientFields
          variant="edit"
          defaults={{
            name: client.name,
            clientType: client.clientType,
            contactName: client.contactName,
            company: client.company,
            parentClientId: client.parentClientId,
            email: client.email,
            phone: client.phone,
            category: client.category,
            status: client.status,
            assignedStaffId: client.assignedStaffId,
            notes: client.notes,
            billingName: client.billingName,
            billingAbn: client.billingAbn,
            billingEmail: client.billingEmail,
            billingAddress: client.billingAddress,
          }}
          staffOptions={staffOptions}
          parentOptions={parentOptions}
        />

        {client.legacyValue && (
          <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-4 py-3 text-xs text-[var(--admin-fg-muted)]">
            <span className="font-medium text-[var(--admin-fg)]">
              Old deal / value note:
            </span>{" "}
            {client.legacyValue}
            <br />
            Add it as a service above to have it counted in MRR — this note is
            kept read-only and will be removed once every client is moved across.
          </p>
        )}

        {state.error && (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
          >
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <AdminButton type="submit" loading={pending}>
            {pending ? "Saving" : "Save changes"}
          </AdminButton>
          <span aria-live="polite" className="text-sm text-[var(--admin-fg-muted)]">
            {saved ? "Saved" : ""}
          </span>
        </div>
      </form>

      <div className="mt-6 border-t border-[var(--admin-border)] pt-6">
        <DeleteClient clientId={client.id} />
      </div>
    </Card>
  );
}

/** Two-click confirm — no native dialog, no accidental deletes. */
function DeleteClient({ clientId }: { clientId: string }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-sm font-medium text-red-500 transition hover:text-red-400"
      >
        Delete client
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-[var(--admin-fg-muted)]">
        Delete this client and all its tasks? This can&apos;t be undone.
      </p>
      <form action={deleteClientAction}>
        <input type="hidden" name="clientId" value={clientId} />
        <AdminButton type="submit" variant="danger">
          Delete permanently
        </AdminButton>
      </form>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
      >
        Cancel
      </button>
    </div>
  );
}
