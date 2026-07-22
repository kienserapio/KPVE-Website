"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  updateLeadAction,
  convertLeadToClientAction,
  type LeadActionState,
} from "@/lib/actions/leads";
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
  PRIORITY_LABELS,
  PRIORITIES,
  CATEGORY_LABELS,
  SERVICE_CATEGORIES,
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
  linkedClientId,
}: {
  lead: LeadDetail;
  staffOptions: StaffOption[];
  linkedClientId: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateLeadAction, initialState);

  // Derived, not stored — a useEffect + setState pair here would just be a
  // second source of truth for something the action state already tells us.
  const saved = state.ok && !pending;

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="leadId" value={lead.id} />

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="category">Category</AdminLabel>
            <select
              id="category"
              name="category"
              defaultValue={lead.category}
              className={selectClass}
            >
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <AdminLabel htmlFor="priority">Priority</AdminLabel>
            <div id="priority" className="flex gap-2">
              {PRIORITIES.map((p) => (
                <PillRadio
                  key={p}
                  name="priority"
                  value={p}
                  label={PRIORITY_LABELS[p]}
                  defaultChecked={lead.priority === p}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <AdminLabel htmlFor="status">Status</AdminLabel>
          <div id="status" className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <PillRadio
                key={status}
                name="status"
                value={status}
                label={STATUS_LABELS[status]}
                defaultChecked={lead.status === status}
              />
            ))}
          </div>
        </div>

        <div>
          <AdminLabel htmlFor="assignedStaffId">Assigned to</AdminLabel>
          <select
            id="assignedStaffId"
            name="assignedStaffId"
            defaultValue={lead.assignedStaffId ?? ""}
            className={selectClass}
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

      {/* Convert — a separate form so it never submits the editor above it. */}
      <div className="mt-6 flex flex-col gap-3 border-t border-[var(--admin-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Won this enquiry?</p>
          <p className="mt-0.5 text-xs text-[var(--admin-fg-muted)]">
            {linkedClientId
              ? "This enquiry is already linked to a client."
              : "Promote it to a client to start tracking work and follow-ups."}
          </p>
        </div>
        {linkedClientId ? (
          <Link
            href={`/admin/clients/${linkedClientId}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--admin-surface-2)]"
          >
            View client →
          </Link>
        ) : (
          <form action={convertLeadToClientAction} className="shrink-0">
            <input type="hidden" name="leadId" value={lead.id} />
            <AdminButton type="submit" variant="secondary">
              Convert to client
            </AdminButton>
          </form>
        )}
      </div>
    </Card>
  );
}

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

function PillRadio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
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
        {label}
      </span>
    </label>
  );
}
