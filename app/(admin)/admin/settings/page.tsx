import { verifySession } from "@/lib/dal/session";
import { getOrgSettings, invoiceReadiness } from "@/lib/dal/settings";
import { formatTaxRate } from "@/lib/billing";
import { Card } from "@/components/admin/ui";
import { OrgSettings } from "@/components/admin/OrgSettings";

export default async function SettingsPage() {
  await verifySession();

  // Self-seeding: the first person to open this page gets a real row with the
  // schema defaults rather than an empty form and a save that has nothing to
  // update. See lib/dal/settings.ts.
  const settings = await getOrgSettings();
  const readiness = invoiceReadiness(settings);
  const blanks = readiness.filter((item) => !item.done);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--admin-fg-muted)]">
          Who KPVE is, on paper. These details print on every invoice, and they
          live here rather than in the code so changing a bank account or an ABN
          isn&apos;t a deploy.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-fg-muted)]">
          An invoice without an ABN is not a tax invoice — it&apos;s a receipt,
          and a client&apos;s accountant can&apos;t use it to claim the expense.
          Fill the three fields below in once and every invoice after it is a
          document that files.
        </p>
      </div>

      {/* ---------- Readiness ----------
          Named blanks rather than a percentage: "you're 67% ready" tells nobody
          which box to go and type in. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Ready to invoice
          </h2>
          <p className="text-xs text-[var(--admin-fg-subtle)]">
            {blanks.length === 0
              ? "Everything a tax invoice needs is here."
              : `${blanks.length} field${blanks.length === 1 ? "" : "s"} still blank.`}
          </p>
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {readiness.map((item) => (
            <li key={item.field} className="flex items-start gap-3">
              <ReadinessMark done={item.done} />
              <span className="min-w-0">
                <span className="sr-only">
                  {item.done ? "Filled in: " : "Still blank: "}
                </span>
                <span
                  className="block text-sm"
                  style={{
                    color: item.done ? "var(--admin-fg)" : "var(--admin-fg-muted)",
                  }}
                >
                  {item.label}
                </span>
                <span className="block text-xs text-[var(--admin-fg-subtle)]">
                  {item.hint}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-[var(--admin-border)] pt-3 text-xs text-[var(--admin-fg-muted)]">
          {settings.gstRegistered ? (
            <>
              GST is on at {formatTaxRate(settings.taxRateBps)}, and your prices{" "}
              {settings.pricesIncludeTax ? "include" : "exclude"} it. Nothing
              further is required — the tax line is computed from the rate.
            </>
          ) : (
            <>
              GST is off, so invoices print no tax line. That&apos;s correct for
              a business that isn&apos;t registered, and nothing extra is needed
              here until it is.
            </>
          )}
        </p>
      </Card>

      <OrgSettings settings={settings} />
    </div>
  );
}

/** Green tick when it's filled in, muted cross when it isn't. */
function ReadinessMark({ done }: { done: boolean }) {
  const color = done ? "var(--svc-active-fg)" : "var(--admin-fg-subtle)";

  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-3">
        {done ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
      </svg>
    </span>
  );
}

export const dynamic = "force-dynamic";
