"use client";

import type { StaffOption } from "@/lib/dal/staff";
import type { ClientStatus, ServiceCategory } from "@/lib/db/schema";
import {
  AdminInput,
  AdminLabel,
  AdminTextarea,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  CATEGORY_LABELS,
  SERVICE_CATEGORIES,
} from "./ui";

export type ClientFieldDefaults = {
  name?: string;
  company?: string | null;
  email?: string;
  phone?: string | null;
  category?: ServiceCategory;
  status?: ClientStatus;
  assignedStaffId?: string | null;
  notes?: string | null;
};

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/**
 * Fields for creating and editing a client.
 *
 * `create` is deliberately the shorter form: who they are, who owns them, and
 * anything worth noting. Category and status are triage that belongs to a
 * client you already have, and what they pay is a list of services attached on
 * their own page — neither is a decision worth blocking "add this person" on.
 */
export function ClientFields({
  variant = "edit",
  defaults = {},
  staffOptions,
}: {
  variant?: "create" | "edit";
  defaults?: ClientFieldDefaults;
  staffOptions: StaffOption[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="name">Name</AdminLabel>
          <AdminInput id="name" name="name" required defaultValue={defaults.name ?? ""} />
        </div>
        <div>
          <AdminLabel htmlFor="company">Company</AdminLabel>
          <AdminInput
            id="company"
            name="company"
            defaultValue={defaults.company ?? ""}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="email">Email</AdminLabel>
          <AdminInput
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaults.email ?? ""}
          />
        </div>
        <div>
          <AdminLabel htmlFor="phone">Phone</AdminLabel>
          <AdminInput
            id="phone"
            name="phone"
            defaultValue={defaults.phone ?? ""}
            placeholder="Optional"
          />
        </div>
      </div>

      {variant === "edit" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="category">Category</AdminLabel>
            <select
              id="category"
              name="category"
              defaultValue={defaults.category ?? "general"}
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
            <AdminLabel htmlFor="status">Status</AdminLabel>
            <select
              id="status"
              name="status"
              defaultValue={defaults.status ?? "active"}
              className={selectClass}
            >
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div>
        <AdminLabel htmlFor="assignedStaffId">Account owner</AdminLabel>
        <select
          id="assignedStaffId"
          name="assignedStaffId"
          defaultValue={defaults.assignedStaffId ?? ""}
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
        <AdminLabel htmlFor="notes">Notes</AdminLabel>
        <AdminTextarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaults.notes ?? ""}
          placeholder="Context, scope, anything the team should know."
        />
      </div>
    </div>
  );
}
