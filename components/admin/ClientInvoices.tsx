"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import {
  createInvoiceAction,
  type InvoiceActionState,
} from "@/lib/actions/invoices";
import type { InvoiceListItem } from "@/lib/dal/invoices";
import type { BillingInterval, ClientServiceStatus } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils";
import { formatMoney, formatQuantityLine, formatRate } from "@/lib/billing";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  InvoiceStatusBadge,
  Money,
  SERVICE_STATUS_LABELS,
} from "./ui";

/* ---------------------------------------------------------------------------
   The Invoices card on a client page: the documents already raised, and the
   builder that raises the next one.

   A billing line carries all the numbers already (unit price, quantity, the
   total, the currency, the cycle) — the DAL snapshots them at issue. So the
   builder is not a form with amounts in it; it's a picker. Tick the lines to
   bill, add the optional paperwork (PO, dates, a note), and land on a draft.

   The Set from invoicedServiceIds() isn't serialisable across the RSC boundary,
   so it arrives as `alreadyInvoiced: string[]`.
--------------------------------------------------------------------------- */

type BuilderLine = {
  id: string;
  label: string;
  unitAmountCents: number;
  quantity: number;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  status: ClientServiceStatus;
};

const initialState: InvoiceActionState = { ok: false, error: null };

export function ClientInvoices({
  clientId,
  clientName,
  invoices,
  services,
  alreadyInvoiced,
}: {
  clientId: string;
  clientName: string;
  invoices: InvoiceListItem[];
  services: BuilderLine[];
  alreadyInvoiced: string[];
}) {
  const [building, setBuilding] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {invoices.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
            >
              <InvoiceStatusBadge status={invoice.status} />
              <Link
                href={`/admin/invoices/${invoice.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums text-[var(--admin-fg)] transition hover:text-[var(--admin-accent)] hover:underline"
              >
                {invoice.number}
              </Link>
              <span
                className={
                  invoice.overdue
                    ? "text-xs font-medium text-red-500"
                    : "text-xs text-[var(--admin-fg-subtle)]"
                }
              >
                {invoice.overdue ? "Overdue · " : ""}
                {formatDate(invoice.issueDate)}
              </span>
              <Money className="text-sm font-medium">
                {formatMoney(invoice.totalCents, invoice.currency)}
              </Money>
              {invoice.status !== "void" && (
                <a
                  href={`/admin/invoices/${invoice.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-[var(--admin-accent)] transition hover:underline"
                >
                  PDF
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--admin-fg-muted)]">No invoices yet.</p>
      )}

      {building ? (
        <NewInvoiceForm
          clientId={clientId}
          clientName={clientName}
          services={services}
          alreadyInvoiced={alreadyInvoiced}
          onDone={() => setBuilding(false)}
        />
      ) : services.length === 0 ? (
        <p className="text-xs text-[var(--admin-fg-subtle)]">
          Add a billable service above before raising an invoice.
        </p>
      ) : (
        <div>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => setBuilding(true)}
          >
            + New invoice
          </AdminButton>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The builder — a picker over the client's billing lines.
--------------------------------------------------------------------------- */

function NewInvoiceForm({
  clientId,
  clientName,
  services,
  alreadyInvoiced,
  onDone,
}: {
  clientId: string;
  clientName: string;
  services: BuilderLine[];
  alreadyInvoiced: string[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(createInvoiceAction, initialState);

  const invoicedSet = new Set(alreadyInvoiced);

  // Default-tick the live, not-yet-billed lines — the common case is "raise the
  // invoice for what they're on". Already-invoiced lines stay tickable, because
  // reissuing (a corrected or repeat invoice) is legitimate.
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      services.map((line) => [line.id, line.status === "active" && !invoicedSet.has(line.id)]),
    ),
  );

  const checkedLines = services.filter((line) => checked[line.id]);
  // The action rejects a mix of currencies; say so before submit rather than
  // after a round-trip. Muted, not blocking — the staff member may be about to
  // untick one.
  const currencies = new Set(checkedLines.map((line) => line.currency.toUpperCase()));
  const mixedCurrency = currencies.size > 1;
  const noneChecked = checkedLines.length === 0;

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
          Lines to bill
        </p>
        <ul className="flex flex-col gap-1.5">
          {services.map((line) => {
            const invoiced = invoicedSet.has(line.id);
            return (
              <li key={line.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-[var(--admin-surface)]">
                  <input
                    type="checkbox"
                    name="clientServiceIds"
                    value={line.id}
                    checked={Boolean(checked[line.id])}
                    onChange={() => toggle(line.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--admin-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-[var(--admin-fg)]">
                        {line.label}
                      </span>
                      <Money muted className="text-xs font-medium">
                        {formatRate(line.amountCents, line.currency, line.interval)}
                      </Money>
                      {line.status !== "active" && (
                        <span className="text-[11px] text-[var(--admin-fg-subtle)]">
                          · {SERVICE_STATUS_LABELS[line.status]}
                        </span>
                      )}
                      {invoiced && (
                        <span className="rounded border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--admin-fg-subtle)]">
                          already invoiced
                        </span>
                      )}
                    </span>
                    {line.quantity > 1 && (
                      <span className="mt-0.5 block text-[11px] text-[var(--admin-fg-subtle)]">
                        {formatQuantityLine(
                          line.unitAmountCents,
                          line.quantity,
                          line.currency,
                          line.interval,
                        )}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {mixedCurrency && (
          <p className="text-xs text-[var(--admin-fg-muted)]">
            Those lines are in different currencies ({[...currencies].join(", ")}).
            An invoice is one currency — untick until only one is left.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="issueDate">Issue date</AdminLabel>
          <AdminInput id="issueDate" name="issueDate" type="date" />
          <p className="mt-1 text-[11px] text-[var(--admin-fg-subtle)]">
            Blank issues today.
          </p>
        </div>
        <div>
          <AdminLabel htmlFor="dueDate">Due date</AdminLabel>
          <AdminInput id="dueDate" name="dueDate" type="date" />
          <p className="mt-1 text-[11px] text-[var(--admin-fg-subtle)]">
            Blank uses the org payment terms.
          </p>
        </div>
      </div>

      <div>
        <AdminLabel htmlFor="poNumber">PO number</AdminLabel>
        <AdminInput
          id="poNumber"
          name="poNumber"
          placeholder="Optional — their purchase-order reference"
        />
      </div>

      <div>
        <AdminLabel htmlFor="notes">Notes</AdminLabel>
        <AdminTextarea
          id="notes"
          name="notes"
          rows={2}
          placeholder={`Optional — anything ${clientName.split(" ")[0] || "the client"} should see on the invoice`}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <AdminButton type="submit" loading={pending} disabled={noneChecked}>
          {pending ? "Creating" : "Create draft"}
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
