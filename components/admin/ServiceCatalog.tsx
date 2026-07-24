"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  addTaskTemplateAction,
  createServiceAction,
  deleteServiceAction,
  deleteTaskTemplateAction,
  toggleServiceActiveAction,
  updateServiceAction,
  type ServiceActionState,
} from "@/lib/actions/services";
import type { ServiceItem } from "@/lib/dal/services";
import type { TaskTemplateItem } from "@/lib/dal/checklists";
import {
  BILLING_INTERVALS,
  centsToInput,
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatRate,
  INTERVAL_LABELS,
} from "@/lib/billing";
import { cn } from "@/lib/utils";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  Card,
  EmptyState,
  Money,
} from "./ui";

const initialState: ServiceActionState = { ok: false, error: null };

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/* ---------------------------------------------------------------------------
   The catalogue: what KPVE sells and what it costs. Editing a price here
   changes the default for the NEXT client put on it — existing clients keep
   the amount that was copied onto them, so nobody gets silently repriced.
--------------------------------------------------------------------------- */

export function ServiceCatalog({
  services,
  templates,
}: {
  services: ServiceItem[];
  templates: TaskTemplateItem[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <NewServiceForm />

      <Card>
        {services.length === 0 ? (
          <EmptyState
            title="No services yet"
            description="Add the things you charge for — “Emails, $11 monthly”, “Hosting, $30 monthly”, “Site build, one-off”. They'll be one click away when you put a client on them."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
            {services.map((service) =>
              editingId === service.id ? (
                <li key={service.id} className="p-4">
                  <EditServiceForm service={service} onDone={() => setEditingId(null)} />
                </li>
              ) : (
                <ServiceRow
                  key={service.id}
                  service={service}
                  checklist={templates.filter((t) => t.serviceId === service.id)}
                  onEdit={() => setEditingId(service.id)}
                />
              ),
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ServiceRow({
  service,
  checklist,
  onEdit,
}: {
  service: ServiceItem;
  checklist: TaskTemplateItem[];
  onEdit: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-x-4 gap-y-3 p-4",
        !service.isActive && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{service.name}</p>
          {!service.isActive && (
            <span className="rounded-md border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-2 py-0.5 text-xs text-[var(--admin-fg-muted)]">
              Archived
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--admin-fg-subtle)]">
          <Money muted className="font-medium">
            {formatRate(
              service.defaultAmountCents,
              service.defaultCurrency,
              service.defaultInterval,
            )}
          </Money>
          {service.unitLabel && <span>· per {service.unitLabel}</span>}
          {service.defaultCurrency !== DEFAULT_CURRENCY && (
            <span>· {service.defaultCurrency}</span>
          )}
          <span>
            ·{" "}
            {service.activeClients === 0
              ? "No clients on it"
              : `${service.activeClients} client${service.activeClients === 1 ? "" : "s"}`}
          </span>
          {service.checklistItems > 0 && (
            <span>
              · {service.checklistItems}-step checklist
            </span>
          )}
        </div>
        {service.description && (
          <p className="mt-1 max-w-2xl text-xs text-[var(--admin-fg-muted)]">
            {service.description}
          </p>
        )}

        <ChecklistEditor serviceId={service.id} items={checklist} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={toggleServiceActiveAction}>
          <input type="hidden" name="serviceId" value={service.id} />
          <input type="hidden" name="isActive" value={service.isActive ? "false" : "true"} />
          <button
            type="submit"
            className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
          >
            {service.isActive ? "Archive" : "Restore"}
          </button>
        </form>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          Edit
        </button>

        {confirmingDelete ? (
          <form action={deleteServiceAction} className="flex items-center gap-2">
            <input type="hidden" name="serviceId" value={service.id} />
            <button
              type="submit"
              className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${service.name}`}
            className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        )}
      </div>

      {confirmingDelete && service.activeClients > 0 && (
        <p className="w-full text-xs text-[var(--admin-fg-muted)]">
          {service.activeClients} client{service.activeClients === 1 ? " is" : "s are"} on
          this. Deleting it here won&apos;t change what they&apos;re billed — their
          line keeps its own name and price. Archive instead if you just want it
          out of the list.
        </p>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Onboarding checklist

   Collapsed by default: it's setup, not something anyone reads daily. Each step
   carries a day offset from the attach date, so putting a client on the service
   produces a dated task list rather than five undated reminders.
--------------------------------------------------------------------------- */

function ChecklistEditor({
  serviceId,
  items,
}: {
  serviceId: string;
  items: TaskTemplateItem[];
}) {
  const [state, formAction, pending] = useActionState(addTaskTemplateAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-3.5 transition group-open:rotate-90"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        Onboarding checklist{items.length > 0 ? ` (${items.length})` : ""}
      </summary>

      <div className="mt-3 max-w-2xl rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
        {items.length === 0 ? (
          <p className="text-xs text-[var(--admin-fg-subtle)]">
            No steps yet. Add the things you owe a client when they buy this —
            kickoff call, assets, DNS, credentials, go-live.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--admin-border)]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--admin-fg)]">
                  {item.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--admin-fg-subtle)]">
                  {item.offsetDays === 0 ? "Day 0" : `+${item.offsetDays}d`}
                </span>
                <form action={deleteTaskTemplateAction}>
                  <input type="hidden" name="templateId" value={item.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${item.title}`}
                    className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </form>
              </li>
            ))}
          </ol>
        )}

        <form ref={formRef} action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="serviceId" value={serviceId} />
          <div className="min-w-[12rem] flex-1">
            <label className="sr-only" htmlFor={`step-${serviceId}`}>
              Step
            </label>
            <AdminInput
              id={`step-${serviceId}`}
              name="title"
              required
              placeholder="e.g. Kickoff call"
              className="py-2 text-xs"
            />
          </div>
          <div className="w-24">
            <label
              className="mb-1 block text-[11px] text-[var(--admin-fg-subtle)]"
              htmlFor={`offset-${serviceId}`}
            >
              Due in
            </label>
            <AdminInput
              id={`offset-${serviceId}`}
              name="offsetDays"
              type="number"
              min={0}
              max={365}
              defaultValue={0}
              className="py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-[var(--admin-border-strong)] px-3 py-2 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface)] hover:text-[var(--admin-fg)] disabled:opacity-60"
          >
            {pending ? "Adding" : "Add step"}
          </button>
        </form>

        {state.error && (
          <p role="alert" className="mt-2 text-xs text-red-500">
            {state.error}
          </p>
        )}
      </div>
    </details>
  );
}

function NewServiceForm() {
  const [state, formAction, pending] = useActionState(createServiceAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold tracking-tight">Add a service</h2>
      <p className="mt-0.5 text-xs text-[var(--admin-fg-subtle)]">
        Anything you charge for. The price here is the price of <em>one</em> — a
        client on four of them is one line with a quantity, not four lines. It
        and the cycle are defaults; both stay editable per client.
      </p>

      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <AdminLabel htmlFor="new-name">Name</AdminLabel>
            <AdminInput id="new-name" name="name" required placeholder="e.g. Emails" />
          </div>
          <div>
            <AdminLabel htmlFor="new-amount">Unit price</AdminLabel>
            <AdminInput
              id="new-amount"
              name="defaultAmount"
              required
              inputMode="decimal"
              placeholder="11.00"
            />
          </div>
          <div>
            <AdminLabel htmlFor="new-currency">Currency</AdminLabel>
            <select
              id="new-currency"
              name="defaultCurrency"
              defaultValue={DEFAULT_CURRENCY}
              className={selectClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <AdminLabel htmlFor="new-interval">Billed</AdminLabel>
            <select
              id="new-interval"
              name="defaultInterval"
              defaultValue="monthly"
              className={selectClass}
            >
              {BILLING_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {INTERVAL_LABELS[i]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <AdminLabel htmlFor="new-unit-label">Unit label</AdminLabel>
            <AdminInput
              id="new-unit-label"
              name="unitLabel"
              placeholder="mailbox"
              maxLength={40}
            />
            <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
              What one of these <em>is</em> — it&apos;s what makes a client&apos;s line
              read “4 mailboxes × $11” instead of “4 × $11”. Leave blank for
              anything that isn&apos;t counted.
            </p>
          </div>
          <div className="sm:col-span-2">
            <AdminLabel htmlFor="new-description">Description</AdminLabel>
            <AdminInput
              id="new-description"
              name="description"
              placeholder="Optional — what's included"
            />
          </div>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-red-500">
            {state.error}
          </p>
        )}

        <div>
          <AdminButton type="submit" loading={pending}>
            {pending ? "Adding" : "Add service"}
          </AdminButton>
        </div>
      </form>
    </Card>
  );
}

function EditServiceForm({
  service,
  onDone,
}: {
  service: ServiceItem;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateServiceAction, initialState);

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-[var(--admin-accent)]/40 bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="isActive" value={service.isActive ? "true" : "false"} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <AdminLabel htmlFor={`name-${service.id}`}>Name</AdminLabel>
          <AdminInput
            id={`name-${service.id}`}
            name="name"
            required
            defaultValue={service.name}
          />
        </div>
        <div>
          <AdminLabel htmlFor={`amount-${service.id}`}>Unit price</AdminLabel>
          <AdminInput
            id={`amount-${service.id}`}
            name="defaultAmount"
            required
            inputMode="decimal"
            defaultValue={centsToInput(service.defaultAmountCents)}
          />
        </div>
        <div>
          <AdminLabel htmlFor={`currency-${service.id}`}>Currency</AdminLabel>
          <select
            id={`currency-${service.id}`}
            name="defaultCurrency"
            defaultValue={service.defaultCurrency}
            className={selectClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <AdminLabel htmlFor={`interval-${service.id}`}>Billed</AdminLabel>
          <select
            id={`interval-${service.id}`}
            name="defaultInterval"
            defaultValue={service.defaultInterval}
            className={selectClass}
          >
            {BILLING_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {INTERVAL_LABELS[i]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <AdminLabel htmlFor={`unit-label-${service.id}`}>Unit label</AdminLabel>
          <AdminInput
            id={`unit-label-${service.id}`}
            name="unitLabel"
            placeholder="mailbox"
            maxLength={40}
            defaultValue={service.unitLabel ?? ""}
          />
          <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
            Makes a line read “4 mailboxes × $11”. Blank if it isn&apos;t counted.
          </p>
        </div>
        <div className="sm:col-span-2">
          <AdminLabel htmlFor={`description-${service.id}`}>Description</AdminLabel>
          <AdminTextarea
            id={`description-${service.id}`}
            name="description"
            rows={2}
            defaultValue={service.description ?? ""}
          />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <AdminButton type="submit" loading={pending}>
          {pending ? "Saving" : "Save"}
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
