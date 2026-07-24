"use client";

import { useActionState, useState, type ReactNode } from "react";

import {
  updateOrgSettingsAction,
  type SettingsActionState,
} from "@/lib/actions/settings";
import type { OrgSettingsRecord } from "@/lib/dal/settings";
import { computeTax, formatMoney, formatTaxRate } from "@/lib/billing";
import { AdminButton, AdminInput, AdminLabel, AdminTextarea, Card } from "./ui";

const initialState: SettingsActionState = { ok: false, error: null };

/**
 * The line the preview does its sums on. $11 is the real one — a client with
 * four mailboxes at $11 is what forced this decision — and it's the smallest
 * amount where inclusive and exclusive GST are obviously different numbers.
 */
const SAMPLE_CENTS = 1100;

/**
 * Percent → basis points, for the live preview only. lib/validation.ts owns the
 * value that actually gets stored; this exists so the preview can update on
 * every keystroke without a round trip, and it deliberately fails soft (0) on
 * anything unparseable rather than showing a number nobody typed.
 */
function previewBps(percent: string): number {
  const n = Number(percent.trim().replace("%", ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return 0;
  return Math.round(n * 100);
}

const money = (cents: number) => formatMoney(cents, "AUD", { alwaysCents: true });

export function OrgSettings({ settings }: { settings: OrgSettingsRecord }) {
  const [state, formAction, pending] = useActionState(
    updateOrgSettingsAction,
    initialState,
  );
  const saved = state.ok && !pending;

  /* The three tax fields are held in state so the preview below can be
     recomputed as they change. Everything else is uncontrolled — nothing else
     on this page has a consequence worth showing before it's saved. */
  const [gstRegistered, setGstRegistered] = useState(settings.gstRegistered);
  const [taxPercent, setTaxPercent] = useState(
    String(Number((settings.taxRateBps / 100).toFixed(2))),
  );
  const [pricesIncludeTax, setPricesIncludeTax] = useState(settings.pricesIncludeTax);

  const breakdown = computeTax(SAMPLE_CENTS, {
    gstRegistered,
    taxRateBps: previewBps(taxPercent),
    pricesIncludeTax,
  });

  // Only a registered business can change what a client is charged by moving
  // this switch — before registration it's a setting with no effect yet.
  const modeChanged =
    settings.gstRegistered &&
    gstRegistered &&
    pricesIncludeTax !== settings.pricesIncludeTax;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* ---------- Business details ---------- */}
      <Section
        title="Business details"
        description="What prints at the top of every invoice. The legal name is the entity the client is buying from — the trading name is only for when the two differ."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="legalName">Legal name</AdminLabel>
            <AdminInput
              id="legalName"
              name="legalName"
              required
              defaultValue={settings.legalName}
              placeholder="e.g. KPVE Pty Ltd"
            />
          </div>
          <div>
            <AdminLabel htmlFor="tradingName">Trading name</AdminLabel>
            <AdminInput
              id="tradingName"
              name="tradingName"
              defaultValue={settings.tradingName ?? ""}
              placeholder="Optional — if you trade under another name"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="abn">ABN</AdminLabel>
            <AdminInput
              id="abn"
              name="abn"
              inputMode="numeric"
              defaultValue={settings.abn ?? ""}
              placeholder="11 222 333 444"
            />
            <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
              Required on a tax invoice. Spaces are stripped when it&apos;s saved.
            </p>
          </div>
          <div>
            <AdminLabel htmlFor="email">Email</AdminLabel>
            <AdminInput
              id="email"
              name="email"
              type="email"
              required
              defaultValue={settings.email}
              placeholder="support@kpve.com"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="phone">Phone</AdminLabel>
            <AdminInput
              id="phone"
              name="phone"
              type="tel"
              defaultValue={settings.phone ?? ""}
              placeholder="Optional"
            />
          </div>
          <div>
            <AdminLabel htmlFor="website">Website</AdminLabel>
            <AdminInput
              id="website"
              name="website"
              defaultValue={settings.website ?? ""}
              placeholder="kpve.com"
            />
          </div>
        </div>

        <div>
          <AdminLabel htmlFor="address">Business address</AdminLabel>
          <AdminTextarea
            id="address"
            name="address"
            rows={3}
            defaultValue={settings.address ?? ""}
            placeholder={"Level 1, 123 Example St\nMelbourne VIC 3000"}
          />
        </div>
      </Section>

      {/* ---------- Tax ---------- */}
      <Section
        title="GST"
        description="Whether there's tax in your prices, and how the invoice says so. These are the only settings here that change what a client pays."
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4">
          <input
            type="checkbox"
            name="gstRegistered"
            checked={gstRegistered}
            onChange={(e) => setGstRegistered(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--admin-accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--admin-fg)]">
              Registered for GST
            </span>
            <span className="mt-0.5 block text-xs text-[var(--admin-fg-muted)]">
              Leave this off until you actually are. Off, invoices print no tax
              line at all and the total is the subtotal — which is correct and
              legal for a business that isn&apos;t registered.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="taxRatePercent">Tax rate (%)</AdminLabel>
            <AdminInput
              id="taxRatePercent"
              name="taxRatePercent"
              inputMode="decimal"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              placeholder="10"
            />
            <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
              Typed as a percent — 10, not 0.1. Stored exactly, so 10.5% never
              rounds a cent the wrong way.
            </p>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              Your prices
            </legend>
            <div className="flex flex-col gap-2">
              <Radio
                name="pricesIncludeTax"
                value="true"
                checked={pricesIncludeTax}
                onChange={() => setPricesIncludeTax(true)}
                label="Include GST"
                hint="The Australian norm. Stored prices don't change."
              />
              <Radio
                name="pricesIncludeTax"
                value="false"
                checked={!pricesIncludeTax}
                onChange={() => setPricesIncludeTax(false)}
                label="Exclude GST"
                hint="Tax is added on top, so clients pay more than the line says."
              />
            </div>
          </fieldset>
        </div>

        {/* ---- What this actually does, in money ---- */}
        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            A {money(SAMPLE_CENTS)} line, invoiced
          </p>
          <p className="mt-2 text-sm tabular-nums text-[var(--admin-fg)]">
            {breakdown.mode === "none" ? (
              <>
                {money(SAMPLE_CENTS)} → total {money(breakdown.totalCents)}. No tax
                line printed.
              </>
            ) : (
              <>
                {money(SAMPLE_CENTS)} → subtotal {money(breakdown.subtotalCents)} +
                GST {money(breakdown.taxCents)} = {money(breakdown.totalCents)}
              </>
            )}
          </p>
          <p className="mt-1.5 text-xs text-[var(--admin-fg-muted)]">
            {breakdown.mode === "none" && (
              <>
                Not registered, so there is nothing to print. A $0 GST line would
                be worse than silence.
              </>
            )}
            {breakdown.mode === "inclusive" && (
              <>
                Stored prices don&apos;t change — a {money(SAMPLE_CENTS)} line stays{" "}
                {money(SAMPLE_CENTS)} and the invoice reads &ldquo;Total includes
                GST of {money(breakdown.taxCents)}&rdquo; at{" "}
                {formatTaxRate(breakdown.taxRateBps)}. MRR, payment links and the
                ledger are untouched.
              </>
            )}
            {breakdown.mode === "exclusive" && (
              <>
                {formatTaxRate(breakdown.taxRateBps)} is added on top, so the
                client pays {money(breakdown.totalCents)} for a line that reads{" "}
                {money(SAMPLE_CENTS)} everywhere else in the CRM.
              </>
            )}
          </p>
        </div>

        {modeChanged && (
          <p
            role="alert"
            className="rounded-lg border px-4 py-3 text-sm"
            style={{
              color: "var(--svc-paused-fg)",
              borderColor: "color-mix(in srgb, var(--svc-paused-fg) 35%, transparent)",
              backgroundColor: "color-mix(in srgb, var(--svc-paused-fg) 12%, transparent)",
            }}
          >
            You&apos;re already registered for GST and you&apos;ve just changed
            which side of the price the tax sits on. Saving this changes what
            every client is charged on every invoice issued from here on —
            invoices already issued keep the rule they were issued under.
          </p>
        )}
      </Section>

      {/* ---------- Invoicing ---------- */}
      <Section
        title="Invoicing"
        description="How invoices are numbered, when they're due, and how a client pays one without a card."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <AdminLabel htmlFor="invoicePrefix">Invoice prefix</AdminLabel>
            <AdminInput
              id="invoicePrefix"
              name="invoicePrefix"
              required
              defaultValue={settings.invoicePrefix}
              placeholder="INV"
            />
            <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
              Numbers read {settings.invoicePrefix || "INV"}-2026-0001. Letters,
              numbers and hyphens only.
            </p>
          </div>
          <div>
            <AdminLabel htmlFor="paymentTermsDays">Payment terms (days)</AdminLabel>
            <AdminInput
              id="paymentTermsDays"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={180}
              defaultValue={settings.paymentTermsDays}
            />
            <p className="mt-1 text-xs text-[var(--admin-fg-subtle)]">
              Sets the due date when an invoice is raised. 0 is due on receipt.
            </p>
          </div>
        </div>

        <div>
          <AdminLabel htmlFor="invoiceFooter">Invoice footer</AdminLabel>
          <AdminTextarea
            id="invoiceFooter"
            name="invoiceFooter"
            rows={3}
            defaultValue={settings.invoiceFooter ?? ""}
            placeholder="Optional — thanks, late-payment terms, anything that belongs at the bottom of every invoice."
          />
        </div>

        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Bank transfer
          </p>
          <p className="mt-1 text-xs text-[var(--admin-fg-muted)]">
            These print on the invoice for clients who won&apos;t pay by card,
            which is most of the ones who ask for an invoice in the first place.
            Leave them blank and the invoice simply doesn&apos;t offer EFT.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <AdminLabel htmlFor="bankName">Bank</AdminLabel>
              <AdminInput
                id="bankName"
                name="bankName"
                defaultValue={settings.bankName ?? ""}
                placeholder="e.g. Commonwealth Bank"
              />
            </div>
            <div>
              <AdminLabel htmlFor="accountName">Account name</AdminLabel>
              <AdminInput
                id="accountName"
                name="accountName"
                defaultValue={settings.accountName ?? ""}
              />
            </div>
            <div>
              <AdminLabel htmlFor="bsb">BSB</AdminLabel>
              <AdminInput
                id="bsb"
                name="bsb"
                inputMode="numeric"
                defaultValue={settings.bsb ?? ""}
                placeholder="123-456"
              />
            </div>
            <div>
              <AdminLabel htmlFor="accountNumber">Account number</AdminLabel>
              <AdminInput
                id="accountNumber"
                name="accountNumber"
                inputMode="numeric"
                defaultValue={settings.accountNumber ?? ""}
              />
            </div>
          </div>
        </div>
      </Section>

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
          {pending ? "Saving" : "Save settings"}
        </AdminButton>
        <span aria-live="polite" className="text-sm text-[var(--admin-fg-muted)]">
          {saved ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------------------
   Pieces
--------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-0.5 max-w-2xl text-xs text-[var(--admin-fg-subtle)]">
        {description}
      </p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] px-3 py-2.5">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-[var(--admin-accent)]"
      />
      <span>
        <span className="block text-sm text-[var(--admin-fg)]">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--admin-fg-muted)]">
          {hint}
        </span>
      </span>
    </label>
  );
}
