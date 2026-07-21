"use client";

import { useActionState } from "react";

import { updateLeadAction, type LeadActionState } from "@/lib/actions/leads";
import type { LeadDetail } from "@/lib/dal/leads";
import type { StaffOption } from "@/lib/dal/staff";
import type { LeadStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  AdminButton,
  AdminLabel,
  AdminTextarea,
  Card,
  STATUS_LABELS,
} from "./ui";

const STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
];

const initialState: LeadActionState = { ok: false, error: null };

export function LeadEditor({
  lead,
  staffOptions,
}: {
  lead: LeadDetail;
  staffOptions: StaffOption[];
}) {
  const [state, formAction, pending] = useActionState(updateLeadAction, initialState);

  // Derived, not stored — a useEffect + setState pair here would just be a
  // second source of truth for something the action state already tells us.
  const saved = state.ok && !pending;

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="leadId" value={lead.id} />

        <div>
          <AdminLabel htmlFor="status">Status</AdminLabel>
          <div id="status" className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <label key={status} className="cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={status}
                  defaultChecked={lead.status === status}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "inline-flex rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    "border-[var(--admin-border)] text-[var(--admin-fg-muted)] hover:bg-[var(--admin-surface-2)]",
                    "peer-checked:border-[var(--admin-accent)] peer-checked:bg-[var(--admin-accent)] peer-checked:text-[var(--admin-accent-fg)]",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--admin-accent)]/50",
                  )}
                >
                  {STATUS_LABELS[status]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <AdminLabel htmlFor="assignedStaffId">Assigned to</AdminLabel>
          <select
            id="assignedStaffId"
            name="assignedStaffId"
            defaultValue={lead.assignedStaffId ?? ""}
            className="w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25"
          >
            <option value="">Unassigned</option>
            {staffOptions.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <AdminLabel htmlFor="internalNotes">Internal notes</AdminLabel>
          <AdminTextarea
            id="internalNotes"
            name="internalNotes"
            rows={5}
            defaultValue={lead.internalNotes ?? ""}
            placeholder="Notes for the team. Never shown to the client."
          />
        </div>

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
    </Card>
  );
}
