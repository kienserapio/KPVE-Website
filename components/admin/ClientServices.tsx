"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  addClientServiceAction,
  addServiceItemAction,
  markBilledAction,
  removeClientServiceAction,
  removeServiceItemAction,
  setClientServiceStatusAction,
  updateClientServiceAction,
  type ServiceActionState,
} from "@/lib/actions/services";
import {
  createPaymentLinkAction,
  revokePaymentLinkAction,
  type PaymentActionState,
} from "@/lib/actions/payments";
import type { ClientServiceItem, ServiceItem } from "@/lib/dal/services";
import {
  BILLING_INTERVALS,
  centsToInput,
  CURRENCIES,
  DEFAULT_CURRENCY,
  formatMoney,
  formatQuantityLine,
  formatRate,
  INTERVAL_LABELS,
  INTERVAL_NOUN,
  INTERVAL_SUFFIX,
  lineTotalCents,
  MAX_QUANTITY,
  parseAmountToCents,
} from "@/lib/billing";
import type { BillingInterval } from "@/lib/db/schema";
import { cn, formatDate } from "@/lib/utils";
import {
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminTextarea,
  Money,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUSES,
  ServiceStatusBadge,
} from "./ui";

const initialState: ServiceActionState = { ok: false, error: null };

const selectClass =
  "w-full rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-3 py-2.5 text-sm text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/25";

/** yyyy-mm-dd in local components — what a `<input type="date">` expects. */
function dateInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * "$11.00 × 4 = $44.00/mo" — the live total under a unit-price/qty pair, so
 * the number that gets stored is on screen before anyone presses Save. All of
 * the maths is lineTotalCents()'s; this only formats it. `alwaysCents` on both
 * sides because a price being edited reads better as $11.00 than $11.
 */
function totalPreview(
  unitInput: string,
  quantityInput: string,
  currency: string,
  interval: BillingInterval,
): string | null {
  const unitCents = parseAmountToCents(unitInput);
  if (unitCents === null) return null;

  const quantity = Number(quantityInput);
  const totalCents = lineTotalCents(unitCents, quantity);

  return (
    `${formatMoney(unitCents, currency, { alwaysCents: true })} × ` +
    `${Number.isFinite(quantity) ? Math.max(Math.trunc(quantity), 1) : 1} = ` +
    `${formatMoney(totalCents, currency, { alwaysCents: true })}${INTERVAL_SUFFIX[interval]}`
  );
}

function TotalPreview({ value }: { value: string | null }) {
  return (
    <p className="text-xs text-[var(--admin-fg-subtle)]">
      {value ? (
        <>
          Line total <span className="font-medium tabular-nums text-[var(--admin-fg)]">{value}</span>
        </>
      ) : (
        "Enter a unit price to see the line total."
      )}
    </p>
  );
}

/* ---------------------------------------------------------------------------
   The billing panel on a client: what they're on, and what to do about it.
--------------------------------------------------------------------------- */

export function ClientServices({
  clientId,
  clientName,
  clientEmail,
  services,
  catalogue,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string;
  services: ClientServiceItem[];
  catalogue: ServiceItem[];
}) {
  // With nothing attached yet, the form is the point of the panel — show it.
  const [adding, setAdding] = useState(services.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // "mailbox" belongs to the catalogue entry, not to the line, so it's looked
  // up once here rather than by each row. A line whose catalogue entry was
  // archived or deleted simply has no unit noun — it still prices correctly.
  const unitLabels = new Map(catalogue.map((service) => [service.id, service.unitLabel]));
  const unitLabelFor = (line: ClientServiceItem) =>
    (line.serviceId ? unitLabels.get(line.serviceId) : null) ?? null;

  return (
    <div className="flex flex-col gap-5">
      {services.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--admin-border)]">
          {services.map((line) =>
            editingId === line.id ? (
              <li key={line.id} className="py-4">
                <EditServiceForm
                  line={line}
                  unitLabel={unitLabelFor(line)}
                  onDone={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ServiceRow
                key={line.id}
                line={line}
                unitLabel={unitLabelFor(line)}
                clientId={clientId}
                clientName={clientName}
                clientEmail={clientEmail}
                onEdit={() => setEditingId(line.id)}
              />
            ),
          )}
        </ul>
      )}

      {adding ? (
        <AddServiceForm
          clientId={clientId}
          catalogue={catalogue}
          onDone={() => setAdding(false)}
          dismissible={services.length > 0}
        />
      ) : (
        <div>
          <AdminButton type="button" variant="secondary" onClick={() => setAdding(true)}>
            + Add service
          </AdminButton>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   One line
--------------------------------------------------------------------------- */

function ServiceRow({
  line,
  unitLabel,
  clientId,
  clientName,
  clientEmail,
  onEdit,
}: {
  line: ClientServiceItem;
  unitLabel: string | null;
  clientId: string;
  clientName: string;
  clientEmail: string;
  onEdit: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const dimmed = line.status === "cancelled";

  return (
    <li className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5", dimmed && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[var(--admin-fg)]">{line.label}</p>
          <ServiceStatusBadge status={line.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--admin-fg-subtle)]">
          {/* At quantity 1 this is exactly the rate it has always been — no
              "1 ×" noise on the lines that are most of them. Above 1 the unit
              price leads and the total follows it. */}
          <Money muted className="font-medium">
            {formatQuantityLine(
              line.unitAmountCents,
              line.quantity,
              line.currency,
              line.interval,
              unitLabel,
            )}
          </Money>
          {line.quantity > 1 && (
            <span>
              ·{" "}
              <Money muted className="font-medium">
                {formatRate(line.amountCents, line.currency, line.interval)}
              </Money>
            </span>
          )}
          {line.currency !== DEFAULT_CURRENCY && <span>· {line.currency}</span>}
          {line.interval !== "one_off" && line.status === "active" && (
            <span className={cn(line.overdue && "font-medium text-red-500")}>
              ·{" "}
              {line.nextBillAt
                ? `${line.overdue ? "Was due" : "Next bill"} ${formatDate(line.nextBillAt)}`
                : "No bill date"}
            </span>
          )}
          {line.startedAt && <span>· Started {formatDate(line.startedAt)}</span>}
          {line.lastPaymentAt && (
            <span className="text-[var(--svc-active-fg)]">
              · Paid {formatDate(line.lastPaymentAt)}
            </span>
          )}
        </div>
        {line.notes && (
          <p className="mt-1 text-xs text-[var(--admin-fg-muted)]">{line.notes}</p>
        )}

        <ProvisionedItems line={line} unitLabel={unitLabel} />

        <PaymentLink
          line={line}
          clientId={clientId}
          clientName={clientName}
          clientEmail={clientEmail}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusSelect line={line} />

        {line.status === "active" && line.interval !== "one_off" && (
          <form action={markBilledAction}>
            <input type="hidden" name="clientServiceId" value={line.id} />
            <button
              type="submit"
              title="Move the next bill date on by one cycle"
              className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
            >
              Mark billed
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
        >
          Edit
        </button>

        {confirmingRemove ? (
          <form action={removeClientServiceAction} className="flex items-center gap-2">
            <input type="hidden" name="clientServiceId" value={line.id} />
            <button
              type="submit"
              className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            aria-label={`Remove ${line.label}`}
            className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        )}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Provisioned

   What was actually set up under the line: the four mailbox addresses behind
   "Emails × 4", the domains behind Hosting, the deliverables behind a build.
   Having them here is what lets the client page answer "what are they paying
   for" without opening anything, and what the invoice prints under the line.
--------------------------------------------------------------------------- */

function ProvisionedItems({
  line,
  unitLabel,
}: {
  line: ClientServiceItem;
  unitLabel: string | null;
}) {
  const [state, formAction, pending] = useActionState(addServiceItemAction, initialState);
  // Quiet until there's something to show. A line nobody has provisioned
  // anything under stays as short as it is today.
  const [open, setOpen] = useState(line.items.length > 0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const noun = unitLabel?.trim() || "item";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 self-start text-[11px] font-medium text-[var(--admin-fg-subtle)] transition hover:text-[var(--admin-fg)]"
      >
        + Provisioned {noun}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        Provisioned
      </p>

      {line.items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {line.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-2 py-1.5 text-[11px] text-[var(--admin-fg-muted)]">
                {item.label}
              </code>
              <form action={removeServiceItemAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  aria-label={`Remove ${item.label}`}
                  className="rounded p-1 text-[var(--admin-fg-subtle)] transition hover:text-red-500"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {line.items.length > 0 && line.items.length !== line.quantity && (
        <QuantityMismatch line={line} />
      )}

      <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="clientServiceId" value={line.id} />
        <label className="sr-only" htmlFor={`item-${line.id}`}>
          Add a provisioned {noun} to {line.label}
        </label>
        <AdminInput
          id={`item-${line.id}`}
          name="label"
          required
          placeholder="name@theirdomain.com.au"
          className="min-w-[12rem] flex-1 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)] disabled:opacity-60"
        >
          {pending ? "Adding" : "Add"}
        </button>
      </form>

      {state.error && (
        <p role="alert" className="text-xs text-red-500">
          {state.error}
        </p>
      )}
    </div>
  );
}

/**
 * Provisioned count and billed quantity should agree. When they don't, say so
 * and offer the fix in one click — never apply it silently. Somebody typed
 * that quantity, and a mismatch is usually a mistake worth seeing rather than
 * a number worth overwriting behind their back.
 */
function QuantityMismatch({ line }: { line: ClientServiceItem }) {
  const [state, formAction, pending] = useActionState(updateClientServiceAction, initialState);
  const listed = line.items.length;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="clientServiceId" value={line.id} />
      {/* Quantity only — the DAL reads the unit price back and recomputes the
          line total, so this cannot leave a stale amount behind. */}
      <input type="hidden" name="quantity" value={listed} />
      <span className="text-[11px] text-[var(--admin-fg-muted)]">
        {listed} item{listed === 1 ? "" : "s"} listed, billed for {line.quantity} —
      </span>
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-medium text-[var(--admin-accent)] underline underline-offset-2 transition hover:opacity-80 disabled:opacity-60"
      >
        {pending ? "Setting quantity" : `set quantity to ${listed}`}
      </button>
      {state.error && (
        <span role="alert" className="text-[11px] text-red-500">
          {state.error}
        </span>
      )}
    </form>
  );
}

/* ---------------------------------------------------------------------------
   Payment link

   The cheapest path to actually taking money: mint a link for this line, copy
   it or email it, and let the webhook (or the simulator) flip the line to
   Active when it clears. Nobody sets "paid" by hand — that's the whole point.

   It charges ONE CYCLE of this line's rate, and on a recurring line it starts a
   subscription that renews until cancelled. That is not obvious from a button
   labelled "Payment link", and getting it wrong is expensive in the one
   direction nobody notices: a two-year arrangement billed through here quietly
   collects one year. So the button now confirms the amount, the recurrence and
   what to use instead, before anything is minted.
--------------------------------------------------------------------------- */

const paymentInitialState: PaymentActionState = { ok: false, error: null };

function PaymentLink({
  line,
  clientId,
  clientName,
  clientEmail,
}: {
  line: ClientServiceItem;
  clientId: string;
  clientName: string;
  clientEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    createPaymentLinkAction,
    paymentInitialState,
  );
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Prefer the URL the action just returned — the server component behind this
  // may not have re-rendered yet, and a stale "no link" state after clicking
  // "Payment link" reads as a failure.
  const url = state.url ?? line.checkoutUrl;
  const simulated = state.simulated ?? line.paymentProvider !== "stripe";

  if (line.status === "cancelled") return null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The URL
      // is on screen and selectable, so this needs no error state of its own.
    }
  }

  const mailto = url
    ? `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(
        `Payment link — ${line.label}`,
      )}&body=${encodeURIComponent(
        `Hi ${clientName.split(" ")[0] || "there"},\n\n` +
          `Here's the payment link for ${line.label} — ${formatRate(
            line.amountCents,
            line.currency,
            line.interval,
          )}:\n\n${url}\n\nThanks,\nKPVE`,
      )}`
    : "";

  return (
    <div className="mt-2 flex flex-col gap-2">
      {url ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-2 py-1.5 text-[11px] text-[var(--admin-fg-muted)]">
              {url}
            </code>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={mailto}
              className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
            >
              Email it
            </a>
            <form action={revokePaymentLinkAction}>
              <input type="hidden" name="clientServiceId" value={line.id} />
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-xs text-[var(--admin-fg-subtle)] transition hover:text-red-500"
              >
                Revoke
              </button>
            </form>
          </div>
          <p className="text-[11px] text-[var(--admin-fg-subtle)]">
            {simulated
              ? "Test link — opening it and pressing Pay runs the full flow without taking money."
              : "Live Stripe link. The line goes Active on its own once payment clears."}
          </p>
        </>
      ) : confirming ? (
        <form
          action={formAction}
          className="flex flex-col gap-2.5 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-3 py-3"
        >
          <input type="hidden" name="clientServiceId" value={line.id} />
          <input type="hidden" name="clientId" value={clientId} />

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              This link charges
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <Money className="text-lg font-semibold">
                {formatMoney(line.amountCents, line.currency)}
              </Money>
              <span className="text-sm text-[var(--admin-fg-muted)]">
                {line.interval === "one_off"
                  ? "once"
                  : `now, then again every ${INTERVAL_NOUN[line.interval]} until cancelled`}
              </span>
            </p>
            {line.quantity > 1 && (
              <p className="mt-0.5 text-[11px] text-[var(--admin-fg-subtle)]">
                {formatQuantityLine(
                  line.unitAmountCents,
                  line.quantity,
                  line.currency,
                  line.interval,
                )}
              </p>
            )}
          </div>

          {/* The whole reason this confirmation exists. A payment link bills one
              cycle and cannot be told to bill three; the invoice is the object
              that carries a duration. */}
          {line.interval !== "one_off" && (
            <p className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--admin-fg-muted)]">
              A payment link always bills <strong>one cycle</strong>. To charge a
              fixed period up front — two years, say — raise an{" "}
              <strong>invoice</strong> in the Invoices card below and set{" "}
              <strong>Bill for</strong>. Its Pay now button takes the whole amount
              in a single payment.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[var(--admin-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-accent-fg)] transition hover:brightness-110 disabled:opacity-60"
            >
              {pending
                ? "Creating link"
                : line.interval === "one_off"
                  ? "Create link"
                  : "Create subscription link"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
            >
              Cancel
            </button>
            {state.error && (
              <span role="alert" className="text-xs text-red-500">
                {state.error}
              </span>
            )}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-[var(--admin-border-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--admin-fg-muted)] transition hover:bg-[var(--admin-surface-2)] hover:text-[var(--admin-fg)]"
          >
            {line.interval === "one_off" ? "Payment link" : "Subscription link"}
          </button>
          {state.error && (
            <span role="alert" className="text-xs text-red-500">
              {state.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Status as a select that posts on change — one control, every transition. */
function StatusSelect({ line }: { line: ClientServiceItem }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={setClientServiceStatusAction} ref={formRef}>
      <input type="hidden" name="clientServiceId" value={line.id} />
      <label className="sr-only" htmlFor={`status-${line.id}`}>
        Status for {line.label}
      </label>
      <select
        id={`status-${line.id}`}
        name="status"
        defaultValue={line.status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-input)] px-2 py-1.5 text-xs text-[var(--admin-fg)] outline-none transition focus:border-[var(--admin-accent)]"
      >
        {SERVICE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {SERVICE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </form>
  );
}

/* ---------------------------------------------------------------------------
   Add
--------------------------------------------------------------------------- */

function AddServiceForm({
  clientId,
  catalogue,
  onDone,
  dismissible,
}: {
  clientId: string;
  catalogue: ServiceItem[];
  onDone: () => void;
  dismissible: boolean;
}) {
  const [state, formAction, pending] = useActionState(addClientServiceAction, initialState);

  // Picking from the catalogue prefills price, cycle and unit noun; every one
  // stays editable, because "Hosting, but $50 for this client" is a normal
  // Tuesday.
  const [serviceId, setServiceId] = useState("");
  const [label, setLabel] = useState("");
  const [unitAmount, setUnitAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  // Closing unmounts this form, so the next "+ Add service" starts empty with
  // no explicit reset — the fields above are local state, not a persisted draft.
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  function pickFromCatalogue(id: string) {
    setServiceId(id);
    const chosen = catalogue.find((s) => s.id === id);
    if (!chosen) return;
    setLabel(chosen.name);
    setUnitAmount(centsToInput(chosen.defaultAmountCents));
    setUnitLabel(chosen.unitLabel);
    setCurrency(chosen.defaultCurrency);
    setInterval(chosen.defaultInterval);
  }

  const active = catalogue.filter((s) => s.isActive);
  const preview = totalPreview(unitAmount, quantity, currency, interval);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="serviceId" value={serviceId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <AdminLabel htmlFor="catalogue">Service</AdminLabel>
          <select
            id="catalogue"
            value={serviceId}
            onChange={(e) => pickFromCatalogue(e.target.value)}
            className={selectClass}
          >
            <option value="">Custom line…</option>
            {active.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {formatRate(
                  service.defaultAmountCents,
                  service.defaultCurrency,
                  service.defaultInterval,
                )}
              </option>
            ))}
          </select>
          {active.length === 0 && (
            <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
              No services in the catalogue yet — add one under Services to get
              prices prefilled here.
            </p>
          )}
        </div>

        <div>
          <AdminLabel htmlFor="label">Shows on this client as</AdminLabel>
          <AdminInput
            id="label"
            name="label"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Emails"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <AdminLabel htmlFor="unitAmount">Unit price</AdminLabel>
          <AdminInput
            id="unitAmount"
            name="unitAmount"
            required
            inputMode="decimal"
            value={unitAmount}
            onChange={(e) => setUnitAmount(e.target.value)}
            placeholder="11.00"
          />
        </div>
        <div>
          <AdminLabel htmlFor="quantity">
            Qty{unitLabel ? ` (${unitLabel})` : ""}
          </AdminLabel>
          <AdminInput
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={MAX_QUANTITY}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div>
          <AdminLabel htmlFor="currency">Currency</AdminLabel>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={selectClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <AdminLabel htmlFor="interval">Billed</AdminLabel>
          <select
            id="interval"
            name="interval"
            value={interval}
            onChange={(e) => setInterval(e.target.value as BillingInterval)}
            className={selectClass}
          >
            {BILLING_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {INTERVAL_LABELS[i]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TotalPreview value={preview} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <AdminLabel htmlFor="startedAt">Starts</AdminLabel>
          <input
            id="startedAt"
            name="startedAt"
            type="date"
            className={selectClass}
          />
        </div>
        <div>
          <AdminLabel htmlFor="status">Status</AdminLabel>
          <select id="status" name="status" defaultValue="active" className={selectClass}>
            {SERVICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SERVICE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-[var(--admin-fg-subtle)]">
            Only <span className="font-medium">Active</span> lines count toward MRR.
          </p>
        </div>
        <div>
          <AdminLabel htmlFor="notes">Note</AdminLabel>
          <AdminInput id="notes" name="notes" placeholder="Optional — scope, plan, anything" />
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <AdminButton type="submit" loading={pending}>
          {pending ? "Adding" : "Add service"}
        </AdminButton>
        {dismissible && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-[var(--admin-fg-muted)] transition hover:text-[var(--admin-fg)]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------------
   Edit
--------------------------------------------------------------------------- */

function EditServiceForm({
  line,
  unitLabel,
  onDone,
}: {
  line: ClientServiceItem;
  unitLabel: string | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateClientServiceAction, initialState);

  // Controlled rather than defaultValue: all four feed the live total below,
  // which has to move as they're typed or it isn't a preview of anything.
  const [unitAmount, setUnitAmount] = useState(centsToInput(line.unitAmountCents));
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [currency, setCurrency] = useState(line.currency);
  const [interval, setInterval] = useState<BillingInterval>(line.interval);

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const preview = totalPreview(unitAmount, quantity, currency, interval);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-[var(--admin-accent)]/40 bg-[var(--admin-surface-2)] p-4"
    >
      <input type="hidden" name="clientServiceId" value={line.id} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <AdminLabel htmlFor={`label-${line.id}`}>Name</AdminLabel>
          <AdminInput id={`label-${line.id}`} name="label" required defaultValue={line.label} />
        </div>
        <div>
          <AdminLabel htmlFor={`unitAmount-${line.id}`}>Unit price</AdminLabel>
          <AdminInput
            id={`unitAmount-${line.id}`}
            name="unitAmount"
            required
            inputMode="decimal"
            value={unitAmount}
            onChange={(e) => setUnitAmount(e.target.value)}
          />
        </div>
        <div>
          <AdminLabel htmlFor={`quantity-${line.id}`}>
            Qty{unitLabel ? ` (${unitLabel})` : ""}
          </AdminLabel>
          <AdminInput
            id={`quantity-${line.id}`}
            name="quantity"
            type="number"
            min={1}
            max={MAX_QUANTITY}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <TotalPreview value={preview} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <AdminLabel htmlFor={`currency-${line.id}`}>Currency</AdminLabel>
          <select
            id={`currency-${line.id}`}
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={selectClass}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <AdminLabel htmlFor={`interval-${line.id}`}>Billed</AdminLabel>
          <select
            id={`interval-${line.id}`}
            name="interval"
            value={interval}
            onChange={(e) => setInterval(e.target.value as BillingInterval)}
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
          <AdminLabel htmlFor={`status-edit-${line.id}`}>Status</AdminLabel>
          <select
            id={`status-edit-${line.id}`}
            name="status"
            defaultValue={line.status}
            className={selectClass}
          >
            {SERVICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SERVICE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <AdminLabel htmlFor={`startedAt-${line.id}`}>Started</AdminLabel>
          <input
            id={`startedAt-${line.id}`}
            name="startedAt"
            type="date"
            defaultValue={dateInputValue(line.startedAt)}
            className={selectClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <AdminLabel htmlFor={`nextBillAt-${line.id}`}>Next bill</AdminLabel>
          <input
            id={`nextBillAt-${line.id}`}
            name="nextBillAt"
            type="date"
            defaultValue={dateInputValue(line.nextBillAt)}
            className={selectClass}
          />
        </div>
        <div className="sm:col-span-3">
          <AdminLabel htmlFor={`notes-${line.id}`}>Note</AdminLabel>
          <AdminTextarea
            id={`notes-${line.id}`}
            name="notes"
            rows={2}
            defaultValue={line.notes ?? ""}
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

/* ---------------------------------------------------------------------------
   Revenue header — the numbers the panel exists to produce
--------------------------------------------------------------------------- */

export function RevenueSummaryStrip({
  totals,
}: {
  totals: { currency: string; mrrCents: number; arrCents: number; oneOffCents: number }[];
}) {
  if (totals.length === 0) {
    return (
      <p className="text-sm text-[var(--admin-fg-muted)]">
        Nothing billable yet. Add a service to start tracking revenue.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {totals.map((total) => (
        <dl key={total.currency} className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-[var(--admin-fg-subtle)]">
              MRR {totals.length > 1 && `(${total.currency})`}
            </dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--admin-accent)]">
              {formatMoney(total.mrrCents, total.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--admin-fg-subtle)]">ARR</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatMoney(total.arrCents, total.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--admin-fg-subtle)]">One-off</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatMoney(total.oneOffCents, total.currency)}
            </dd>
          </div>
        </dl>
      ))}
    </div>
  );
}
