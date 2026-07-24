"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { StaffOption } from "@/lib/dal/staff";
import type { ClientStatus, ClientType, ServiceCategory } from "@/lib/db/schema";
import {
  AdminInput,
  AdminLabel,
  AdminTextarea,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  CLIENT_TYPE_LABELS,
  CLIENT_TYPES,
  CATEGORY_LABELS,
  SERVICE_CATEGORIES,
} from "./ui";

export type ClientFieldDefaults = {
  name?: string;
  clientType?: ClientType;
  contactName?: string | null;
  company?: string | null;
  parentClientId?: string | null;
  email?: string;
  phone?: string | null;
  category?: ServiceCategory;
  status?: ClientStatus;
  assignedStaffId?: string | null;
  notes?: string | null;
  billingName?: string | null;
  billingAbn?: string | null;
  billingEmail?: string | null;
  billingAddress?: string | null;
};

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

const hintClass = "mt-1.5 text-xs text-[var(--admin-fg-subtle)]";

/**
 * Fields for creating and editing a client.
 *
 * `create` is deliberately the shorter form: who they are, who owns them, and
 * anything worth noting. Category and status are triage that belongs to a
 * client you already have, and what they pay is a list of services attached on
 * their own page — neither is a decision worth blocking "add this person" on.
 *
 * The individual/company choice is on BOTH variants: a client entered as an
 * individual that turns out to be a company is a one-field fix, not a re-entry.
 * Every field the choice hides keeps posting its value from state, so flipping
 * the switch twice never wipes something somebody typed.
 */
export function ClientFields({
  variant = "edit",
  defaults = {},
  staffOptions,
  parentOptions = [],
}: {
  variant?: "create" | "edit";
  defaults?: ClientFieldDefaults;
  staffOptions: StaffOption[];
  /** Individual clients this business can be owned by. Empty is fine. */
  parentOptions?: { id: string; name: string }[];
}) {
  const [clientType, setClientType] = useState<ClientType>(
    defaults.clientType ?? "individual",
  );
  // Controlled because they are unmounted when the other type is selected —
  // an uncontrolled input loses what was typed the moment it leaves the tree.
  const [company, setCompany] = useState(defaults.company ?? "");
  const [contactName, setContactName] = useState(defaults.contactName ?? "");
  const [parentClientId, setParentClientId] = useState(defaults.parentClientId ?? "");

  const [billingOpen, setBillingOpen] = useState(
    Boolean(
      defaults.billingName ||
        defaults.billingAbn ||
        defaults.billingEmail ||
        defaults.billingAddress,
    ),
  );

  const isCompany = clientType === "company";

  return (
    <div className="flex flex-col gap-5">
      {/* The choice everything below re-labels around. Posted as a hidden
          input so the server sees one plain field, not a control. */}
      <input type="hidden" name="clientType" value={clientType} />
      <div>
        <AdminLabel>Client type</AdminLabel>
        <div
          role="group"
          aria-label="Client type"
          className="inline-flex gap-1 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] p-1"
        >
          {CLIENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setClientType(type)}
              aria-pressed={clientType === type}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition",
                clientType === type
                  ? "bg-[var(--admin-accent)] text-[var(--admin-accent-fg)]"
                  : "text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]",
              )}
            >
              {CLIENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <p className={hintClass}>
          {isCompany
            ? "The record is the business. Name it as it should appear on an invoice, and put the person you deal with underneath."
            : "A person. Attach the businesses they own once this record exists."}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="name">{isCompany ? "Business name" : "Name"}</AdminLabel>
          <AdminInput
            id="name"
            name="name"
            required
            defaultValue={defaults.name ?? ""}
            placeholder={isCompany ? "Rare Gem Exchange Pty Ltd" : undefined}
          />
          {isCompany && (
            <p className={hintClass}>What appears on their invoices.</p>
          )}
        </div>

        {isCompany ? (
          <div>
            <AdminLabel htmlFor="contactName">Contact person</AdminLabel>
            <AdminInput
              id="contactName"
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Who we actually talk to"
            />
          </div>
        ) : (
          <div>
            <AdminLabel htmlFor="company">Company</AdminLabel>
            <AdminInput
              id="company"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Optional"
            />
          </div>
        )}
      </div>

      {/* A company's own name IS its business name, so the free-text company
          field would be a second, disagreeing copy of it. Hidden rather than
          dropped: the value comes straight back if the type is switched. */}
      {isCompany && <input type="hidden" name="company" value={company} />}
      {!isCompany && <input type="hidden" name="contactName" value={contactName} />}

      {isCompany ? (
        <div>
          <AdminLabel htmlFor="parentClientId">Owned by</AdminLabel>
          <select
            id="parentClientId"
            name="parentClientId"
            value={parentClientId}
            onChange={(e) => setParentClientId(e.target.value)}
            className={selectClass}
          >
            <option value="">Not linked</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <p className={hintClass}>
            The individual client this business belongs to — their page then
            lists it, with its revenue, under Businesses. One level only: a
            business can&apos;t own a business.
          </p>
        </div>
      ) : (
        /* Nobody owns a person. Posting the empty value releases a link left
           over from a record that was a company a moment ago, rather than
           leaving someone hanging off another client's Businesses card. */
        <input type="hidden" name="parentClientId" value="" />
      )}

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

      {/* Collapsed by default — most clients need none of this, and four more
          always-open fields is what makes a form look like paperwork. Opens
          itself when there is already something in it. */}
      <details
        open={billingOpen}
        onToggle={(e) => setBillingOpen(e.currentTarget.open)}
        className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-4 py-3"
      >
        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
          Billing details
        </summary>
        <p className="mt-2 text-xs text-[var(--admin-fg-muted)]">
          What prints on an invoice, when it differs from the contact details
          above. An ABN is what makes that invoice a tax invoice the client can
          claim as an expense — without one it&apos;s just a receipt.
        </p>

        <div className="mt-4 flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <AdminLabel htmlFor="billingName">Legal / billing name</AdminLabel>
              <AdminInput
                id="billingName"
                name="billingName"
                defaultValue={defaults.billingName ?? ""}
                placeholder="Leave blank to use the name above"
              />
            </div>
            <div>
              <AdminLabel htmlFor="billingAbn">ABN</AdminLabel>
              <AdminInput
                id="billingAbn"
                name="billingAbn"
                defaultValue={defaults.billingAbn ?? ""}
                placeholder="12 345 678 901"
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <AdminLabel htmlFor="billingEmail">Billing email</AdminLabel>
            <AdminInput
              id="billingEmail"
              name="billingEmail"
              type="email"
              defaultValue={defaults.billingEmail ?? ""}
              placeholder="accounts@ — if different from the address above"
            />
          </div>

          <div>
            <AdminLabel htmlFor="billingAddress">Billing address</AdminLabel>
            <AdminTextarea
              id="billingAddress"
              name="billingAddress"
              rows={3}
              defaultValue={defaults.billingAddress ?? ""}
              placeholder="Street, suburb, state, postcode"
            />
          </div>
        </div>
      </details>

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
