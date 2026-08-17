import type { InvoiceDetail } from "@/lib/dal/invoices";
import { formatDuration, formatMoney, formatTaxRate } from "@/lib/billing";
import { formatDate } from "@/lib/utils";
import { KPVE_LOGO_DATA_URI, LETTERHEAD_BG } from "@/lib/brand/logo";
import { InvoiceStatusBadge, Money } from "./ui";

/* ---------------------------------------------------------------------------
   The invoice document — one printable sheet, shared by the admin view and the
   client's public copy.

   Why a single component for both: the whole promise of P7.5 is that "the
   browser's Print to PDF produces the file, and it's the same file the client
   sees." Two renderers would be two documents, and the day they diverge is the
   day an accountant bounces one of them. So the body here is identical for both
   variants; `variant` only toggles trivia — the ATO completeness warnings, which
   are a staff tool and must never appear on the copy a client holds, and a touch
   of emphasis on how to pay.

   It is a pure server component: no state, no handlers. Every interactive control
   (send, void, print, copy-link, pay-now) lives in the page chrome around it and
   is marked `no-print`, so what prints is only ever the invoice.
--------------------------------------------------------------------------- */

const DOLLARS_1000_CENTS = 100_000; // $1,000 — the ATO buyer-ABN threshold.

export function InvoiceDocument({
  invoice,
  variant,
}: {
  invoice: InvoiceDetail;
  variant: "admin" | "public";
}) {
  const currency = invoice.currency;

  // An unregistered business does not issue "tax invoices" — the words are a
  // legal claim about GST, so a mode-"none" document is just an "Invoice".
  const isTaxInvoice = invoice.taxMode !== "none";

  const balanceDueCents = invoice.totalCents - invoice.amountPaidCents;
  const hasBankDetails = Boolean(
    invoice.bankDetails.bankName ||
      invoice.bankDetails.bsb ||
      invoice.bankDetails.accountName ||
      invoice.bankDetails.accountNumber,
  );

  // Completeness check — staff-only. This is the spec's "warns when a field it
  // needs is blank rather than printing a document the accountant will bounce."
  // It is never computed onto the public copy: the client can't fix these, and
  // pointing out our own missing ABN on their invoice helps nobody.
  const warnings: string[] = [];
  if (variant === "admin") {
    if (!invoice.sellerAbn) {
      warnings.push(
        "No seller ABN. Without it this isn't a tax invoice and the client can't claim it as an expense.",
      );
    }
    if (invoice.totalCents >= DOLLARS_1000_CENTS && !invoice.billToAbn) {
      warnings.push(
        "Total is $1,000 or more but the buyer has no ABN. A compliant tax invoice needs the buyer's identity and ABN at this amount.",
      );
    }
  }

  return (
    <article className="invoice-print mx-auto w-full max-w-[820px] overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-fg)] shadow-[var(--admin-shadow)]">
      {/* Letterhead — the brand band, edge to edge. It sits OUTSIDE the body's
          padding (hence the article's p-0 and the inner wrapper below) because a
          letterhead that stops short of the paper edge reads as a picture of a
          letterhead. `letterhead-band` is what the print stylesheet targets to
          force the black through: browsers drop background colour by default
          when printing, and a blank strip where the logo should be is worse
          than no band at all. */}
      <div
        className="letterhead-band flex items-center justify-center py-7"
        style={{ backgroundColor: LETTERHEAD_BG }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has
            nothing for next/image to optimise, and Image would break print. */}
        <img
          src={KPVE_LOGO_DATA_URI}
          alt={invoice.sellerName}
          width={56}
          height={56}
          className="h-14 w-14"
        />
      </div>

      <div className="invoice-body p-8 sm:p-10">
      {warnings.length > 0 && (
        <div className="no-print mb-8 rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface-2)] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Not a complete tax invoice yet
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {warnings.map((warning) => (
              <li key={warning} className="text-sm text-[var(--admin-fg-muted)]">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Header — the document's identity, plus its dates and state. */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--admin-border)] pb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isTaxInvoice ? "Tax invoice" : "Invoice"}
          </h1>
          <p className="mt-1 text-sm tabular-nums text-[var(--admin-fg-muted)]">
            {invoice.number}
          </p>
        </div>
        <dl className="flex flex-col items-start gap-1.5 text-sm sm:items-end">
          <div>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <MetaLine label="Issued" value={formatDate(invoice.issueDate)} />
          {invoice.dueDate && (
            <MetaLine label="Due" value={formatDate(invoice.dueDate)} />
          )}
          {/* Only when the invoice bills more than one cycle. On a plain
              monthly invoice the per-line period already says it, and a second
              copy in the header is noise. */}
          {invoice.coverMonths && invoice.coverStart && invoice.coverEnd && (
            <MetaLine
              label="Period"
              value={`${formatDate(invoice.coverStart)} – ${formatDate(invoice.coverEnd)}`}
            />
          )}
          {invoice.poNumber && (
            <MetaLine label="PO number" value={invoice.poNumber} />
          )}
        </dl>
      </header>

      {/* Both parties, side by side on screen and on paper. The From block is
          the seller identity + ABN the ATO requires; the Bill to block is the
          buyer identity (and ABN once the total crosses $1,000). */}
      <section className="grid grid-cols-2 gap-8 py-8">
        <Party
          heading="From"
          name={invoice.sellerName}
          abn={invoice.sellerAbn}
          email={invoice.sellerEmail}
          address={invoice.sellerAddress}
        />
        <Party
          heading="Bill to"
          name={invoice.billToName}
          abn={invoice.billToAbn}
          email={invoice.billToEmail}
          address={invoice.billToAddress}
        />
      </section>

      {/* Lines — description with its provisioned items, the period the charge
          covers, and the money. */}
      <section className="overflow-x-auto border-t border-[var(--admin-border)]">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--admin-border)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
              <th scope="col" className="py-3 pr-4 font-semibold">
                Description
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Qty
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Unit price
              </th>
              <th scope="col" className="py-3 pl-4 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => {
              const items = line.details
                ? line.details.split("\n").filter((item) => item.trim())
                : [];
              const period = periodLabel(line.periodStart, line.periodEnd);

              return (
                <tr
                  key={line.id}
                  className="border-b border-[var(--admin-border)] align-top"
                >
                  <td className="py-4 pr-4">
                    <p className="font-medium text-[var(--admin-fg)]">
                      {line.label}
                    </p>
                    {line.description && (
                      <p className="mt-1 text-xs text-[var(--admin-fg-muted)]">
                        {line.description}
                      </p>
                    )}
                    {items.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 text-xs text-[var(--admin-fg-muted)]">
                        {items.map((item, index) => (
                          <li key={`${line.id}-${index}`} className="flex gap-2">
                            <span aria-hidden className="text-[var(--admin-fg-subtle)]">
                              •
                            </span>
                            <span className="min-w-0 break-words">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {period && (
                      <p className="mt-2 text-xs text-[var(--admin-fg-subtle)]">
                        {line.periods > 1 ? `${line.periods} × ` : ""}
                        {period}
                      </p>
                    )}
                  </td>
                  {/* A quantity of 1 is the common case; showing the bare "1"
                      in its own column is honest without the "1 ×" noise the
                      inline formatter deliberately drops.

                      A multi-period line prints "4 × 24" so the arithmetic on
                      the row still closes: 4 × 24 × $11.00 = $1,056.00. Folding
                      it into a bare 96 would be shorter and unreadable. */}
                  <td className="px-4 py-4 text-right tabular-nums text-[var(--admin-fg-muted)]">
                    {line.periods > 1 ? `${line.quantity} × ${line.periods}` : line.quantity}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-[var(--admin-fg-muted)]">
                    {formatMoney(line.unitAmountCents, currency)}
                  </td>
                  <td className="py-4 pl-4 text-right">
                    <Money className="font-medium">
                      {formatMoney(line.amountCents, currency)}
                    </Money>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Said once, in words, under the lines: an invoice for eleven hundred
          dollars against a service the client knows costs forty-four a month
          needs to explain itself before the reader reaches the total. */}
      {invoice.coverMonths ? (
        <p className="pt-4 text-xs text-[var(--admin-fg-muted)]">
          Billed {formatDuration(invoice.coverMonths)} in advance.
        </p>
      ) : null}

      {/* Totals — right-aligned, and the one place GST is stated. Which lines
          appear is entirely a function of taxMode, snapshotted at issue. */}
      <section className="flex justify-end pt-6">
        <dl className="w-full max-w-xs flex-col gap-2 text-sm">
          {invoice.taxMode === "none" ? (
            <TotalRow label="Total" value={formatMoney(invoice.totalCents, currency)} strong />
          ) : invoice.taxMode === "inclusive" ? (
            <>
              <TotalRow
                label="Subtotal"
                value={formatMoney(invoice.subtotalCents, currency)}
                muted
              />
              <TotalRow
                label={`Includes GST (${formatTaxRate(invoice.taxRateBps)})`}
                value={formatMoney(invoice.taxCents, currency)}
                muted
              />
              <TotalRow
                label="Total (GST inclusive)"
                value={formatMoney(invoice.totalCents, currency)}
                strong
              />
            </>
          ) : (
            <>
              <TotalRow
                label="Subtotal"
                value={formatMoney(invoice.subtotalCents, currency)}
                muted
              />
              <TotalRow
                label={`GST (${formatTaxRate(invoice.taxRateBps)})`}
                value={formatMoney(invoice.taxCents, currency)}
                muted
              />
              <TotalRow
                label="Total"
                value={formatMoney(invoice.totalCents, currency)}
                strong
              />
            </>
          )}

          {invoice.amountPaidCents > 0 && (
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--admin-border)] pt-2">
              <TotalRow
                label="Amount paid"
                value={`− ${formatMoney(invoice.amountPaidCents, currency)}`}
                muted
              />
              <TotalRow
                label="Balance due"
                value={formatMoney(balanceDueCents, currency)}
                strong
              />
            </div>
          )}
        </dl>
      </section>

      {invoice.notes && (
        <section className="mt-8 border-t border-[var(--admin-border)] pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--admin-fg-muted)]">
            {invoice.notes}
          </p>
        </section>
      )}

      {/* How to pay — the live EFT block, shown only while there's a balance to
          settle. On the client's copy it leads ("here's how to pay"); on the
          staff copy it's reference detail. Suppressed once nothing is owed. */}
      {hasBankDetails && balanceDueCents > 0 && (
        <section className="mt-8 border-t border-[var(--admin-border)] pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
            How to pay
          </h2>
          <p className="mt-2 text-sm text-[var(--admin-fg-muted)]">
            {variant === "public"
              ? "Pay by electronic transfer to the account below."
              : "Bank transfer details for this invoice."}{" "}
            Use <span className="font-medium text-[var(--admin-fg)]">{invoice.number}</span> as
            the payment reference.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:max-w-md">
            {invoice.bankDetails.bankName && (
              <PayLine label="Bank" value={invoice.bankDetails.bankName} />
            )}
            {invoice.bankDetails.accountName && (
              <PayLine label="Account name" value={invoice.bankDetails.accountName} />
            )}
            {invoice.bankDetails.bsb && (
              <PayLine label="BSB" value={invoice.bankDetails.bsb} numeric />
            )}
            {invoice.bankDetails.accountNumber && (
              <PayLine label="Account number" value={invoice.bankDetails.accountNumber} numeric />
            )}
          </dl>
        </section>
      )}

      {invoice.bankDetails.invoiceFooter && (
        <footer className="mt-8 border-t border-[var(--admin-border)] pt-6">
          <p className="whitespace-pre-line text-xs text-[var(--admin-fg-subtle)]">
            {invoice.bankDetails.invoiceFooter}
          </p>
        </footer>
      )}
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------------
   Small building blocks
--------------------------------------------------------------------------- */

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 sm:justify-end">
      <dt className="text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd className="font-medium text-[var(--admin-fg)]">{value}</dd>
    </div>
  );
}

function Party({
  heading,
  name,
  abn,
  email,
  address,
}: {
  heading: string;
  name: string;
  abn: string | null;
  email: string | null;
  address: string | null;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-fg-subtle)]">
        {heading}
      </h2>
      <p className="mt-2 font-medium text-[var(--admin-fg)]">{name}</p>
      {abn && (
        <p className="mt-0.5 text-sm tabular-nums text-[var(--admin-fg-muted)]">
          ABN {abn}
        </p>
      )}
      {address && (
        <p className="mt-1 whitespace-pre-line break-words text-sm text-[var(--admin-fg-muted)]">
          {address}
        </p>
      )}
      {email && (
        <p className="mt-1 break-words text-sm text-[var(--admin-fg-muted)]">{email}</p>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className={
          strong
            ? "text-sm font-semibold text-[var(--admin-fg)]"
            : muted
              ? "text-[var(--admin-fg-muted)]"
              : "text-[var(--admin-fg)]"
        }
      >
        {label}
      </dt>
      <dd
        className={
          strong
            ? "text-base font-semibold tabular-nums text-[var(--admin-fg)]"
            : "tabular-nums text-[var(--admin-fg-muted)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PayLine({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--admin-fg-subtle)]">{label}</dt>
      <dd className={`mt-0.5 text-[var(--admin-fg)] ${numeric ? "tabular-nums" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/** "1 Aug 2025 – 31 Aug 2025", or a single date, or nothing when there's no period. */
function periodLabel(start: Date | null, end: Date | null): string | null {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return formatDate(start);
  if (end) return formatDate(end);
  return null;
}
