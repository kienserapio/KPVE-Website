"use client";

import { useActionState } from "react";

import { createClientAction, type ClientActionState } from "@/lib/actions/clients";
import type { StaffOption } from "@/lib/dal/staff";
import { AdminButton, Card } from "./ui";
import { ClientFields, type ClientFieldDefaults } from "./ClientFields";

const initialState: ClientActionState = { ok: false, error: null };

export function ClientForm({
  staffOptions,
  defaults,
}: {
  staffOptions: StaffOption[];
  defaults?: ClientFieldDefaults;
}) {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-6">
        <ClientFields defaults={defaults} staffOptions={staffOptions} />

        {state.error && (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
          >
            {state.error}
          </p>
        )}

        <div>
          <AdminButton type="submit" loading={pending}>
            {pending ? "Creating" : "Create client"}
          </AdminButton>
        </div>
      </form>
    </Card>
  );
}
