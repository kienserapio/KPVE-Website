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
}: {
  client: ClientDetail;
  staffOptions: StaffOption[];
}) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);
  const saved = state.ok && !pending;

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="clientId" value={client.id} />

        <ClientFields
          defaults={{
            name: client.name,
            company: client.company,
            email: client.email,
            phone: client.phone,
            category: client.category,
            status: client.status,
            value: client.value,
            assignedStaffId: client.assignedStaffId,
            notes: client.notes,
          }}
          staffOptions={staffOptions}
        />

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
