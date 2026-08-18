/**
 * Fill a DEMO client with services, invoices and payments so the client portal
 * has something to show.
 *
 *   npm run portal:demo -- --client "ZZ Test"
 *
 * Everything it writes is fake: made-up billing lines, made-up invoices, and a
 * payment ledger that never went near Stripe. That is fine on a throwaway
 * client and catastrophic on a real one — an invented invoice on a paying
 * client's account is a number their accountant will eventually ask about.
 *
 * So it REFUSES any client whose name doesn't look like a test account, and
 * --force is deliberately not implemented. If you need demo data on a real
 * client, you need a different client.
 *
 * Re-running it wipes the demo rows it created before and writes fresh ones, so
 * the dates stay relative to today.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import postgres from "postgres";

/** A name has to say it is not real. Belt and braces, both spelled out. */
const SAFE_NAME = /\b(test|demo|sample|sandbox|example)\b/i;

/**
 * How a re-run finds what the last run wrote: `created_by is null`.
 *
 * Every real service line and invoice is written by a signed-in staff member,
 * so the DAL always stamps created_by (lib/dal/services.ts, lib/dal/invoices.ts).
 * Nothing this script writes has a staff member behind it, which makes a null
 * there a reliable and — the part that matters — INVISIBLE marker.
 *
 * The obvious alternative was to write a tag into `notes`. That column is
 * printed on the client's copy of the invoice, so the tag ended up on the
 * document under a "Notes" heading. A marker the customer can read is not a
 * marker.
 */
const DEMO_PAYMENT_TAG = "portal-demo-seed";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  let current: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--")) {
      current = arg.slice(2);
      out[current] = "";
    } else if (current) {
      out[current] = out[current] ? `${out[current]} ${arg}` : arg;
    }
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Days from now, as a Date. Negative is the past. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** A `date` column wants 'YYYY-MM-DD', in Sydney — the same rule the app uses. */
function toDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function main() {
  const { client } = parseArgs();

  if (!client) {
    console.error('Usage: npm run portal:demo -- --client "<id or name>"');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });

  const matches = UUID.test(client.trim())
    ? await sql`select id, name, email, billing_name, billing_email, billing_abn, billing_address
                from clients where id = ${client.trim()}`
    : await sql`select id, name, email, billing_name, billing_email, billing_abn, billing_address
                from clients
                where name ilike ${`%${client.trim()}%`} or company ilike ${`%${client.trim()}%`}
                order by name limit 10`;

  if (matches.length === 0) {
    await sql.end();
    console.error(`No client matches "${client}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    await sql.end();
    console.error(`"${client}" matches ${matches.length} clients:`);
    for (const row of matches) console.error(`  ${row.id}  ${row.name}`);
    process.exit(1);
  }

  const target = matches[0];

  if (!SAFE_NAME.test(target.name)) {
    await sql.end();
    console.error(
      `Refusing to write demo data to "${target.name}".\n` +
        "This script invents invoices and payments, which must never land on a\n" +
        "real client. Rename the client to include 'test' or 'demo', or seed a\n" +
        "different one.",
    );
    process.exit(1);
  }

  const [settings] = await sql`
    select legal_name, abn, address, email, invoice_prefix, payment_terms_days
    from org_settings limit 1
  `;
  const seller = settings ?? {
    legal_name: "KPVE",
    abn: null,
    address: null,
    email: "support@kpve.com",
    invoice_prefix: "INV",
    payment_terms_days: 14,
  };

  /* ---- Clear anything a previous run left behind ------------------------ */

  // Payments first, then invoices, then the lines: invoice_lines cascade with
  // their invoice, and payments only SET NULL, so an orphan would survive.
  await sql`delete from payments where client_id = ${target.id} and metadata->>'seed' = ${DEMO_PAYMENT_TAG}`;
  await sql`delete from invoices where client_id = ${target.id} and created_by is null`;
  await sql`delete from client_services where client_id = ${target.id} and created_by is null`;

  /* ---- Services -------------------------------------------------------- */

  type SeedLine = {
    label: string;
    unit: number;
    quantity: number;
    term: number;
    interval: "one_off" | "weekly" | "monthly" | "quarterly" | "annually";
    status: "pending_payment" | "active" | "paused" | "cancelled";
    startedDays: number;
    nextBillDays: number | null;
    cancelledDays?: number;
    lastPaymentDays?: number;
    subscription?: string;
    items?: string[];
  };

  const seedLines: SeedLine[] = [
    {
      label: "Website hosting & maintenance",
      unit: 9000,
      quantity: 1,
      term: 1,
      interval: "monthly",
      status: "active",
      startedDays: -240,
      nextBillDays: 12,
      lastPaymentDays: -18,
      // A real subscription at the provider, so the portal can honestly say
      // "renews automatically" on this one and "we invoice you" on the rest.
      subscription: "sub_demo_hosting",
      items: ["zztest.com.au", "staging.zztest.com.au"],
    },
    {
      label: "Business email",
      unit: 1100,
      quantity: 4,
      term: 1,
      interval: "monthly",
      status: "active",
      startedDays: -240,
      nextBillDays: 12,
      lastPaymentDays: -18,
      items: [
        "admin@zztest.com.au",
        "accounts@zztest.com.au",
        "hello@zztest.com.au",
        "kien@zztest.com.au",
      ],
    },
    {
      label: "Domain registration",
      unit: 4400,
      quantity: 2,
      term: 2, // two years per charge — $44/domain/year, billed 2 at a time
      interval: "annually",
      status: "active",
      startedDays: -400,
      nextBillDays: 330,
      lastPaymentDays: -400,
      items: ["zztest.com.au", "zztest.com"],
    },
    {
      label: "Brand refresh — logo & collateral",
      unit: 240000,
      quantity: 1,
      term: 1,
      interval: "one_off",
      status: "active",
      startedDays: -150,
      nextBillDays: null,
      lastPaymentDays: -140,
    },
    {
      label: "Social media management",
      unit: 55000,
      quantity: 1,
      term: 1,
      interval: "monthly",
      status: "paused",
      startedDays: -180,
      nextBillDays: null,
      lastPaymentDays: -75,
    },
    {
      label: "Google Ads management",
      unit: 45000,
      quantity: 1,
      term: 1,
      interval: "monthly",
      status: "cancelled",
      startedDays: -300,
      nextBillDays: null,
      cancelledDays: -60,
      lastPaymentDays: -70,
    },
  ];

  const lineIds: Record<string, string> = {};

  for (const line of seedLines) {
    const amount = line.unit * line.quantity * line.term;
    const [row] = await sql`
      insert into client_services (
        client_id, label, unit_amount_cents, quantity, term_count, amount_cents,
        currency, interval, status, started_at, next_bill_at, cancelled_at,
        last_payment_at, external_subscription_id, payment_provider
      ) values (
        ${target.id}, ${line.label}, ${line.unit}, ${line.quantity}, ${line.term},
        ${amount}, 'AUD', ${line.interval}, ${line.status},
        ${daysFromNow(line.startedDays)},
        ${line.nextBillDays === null ? null : daysFromNow(line.nextBillDays)},
        ${line.cancelledDays === undefined ? null : daysFromNow(line.cancelledDays)},
        ${line.lastPaymentDays === undefined ? null : daysFromNow(line.lastPaymentDays)},
        ${line.subscription ?? null},
        ${line.subscription ? "stripe" : null}
      )
      returning id
    `;
    lineIds[line.label] = row.id;

    for (const [position, item] of (line.items ?? []).entries()) {
      await sql`
        insert into client_service_items (client_service_id, label, position)
        values (${row.id}, ${item}, ${position})
      `;
    }
  }

  /* ---- Invoices -------------------------------------------------------- */

  const billToName = target.billing_name || target.name;
  const billToEmail = target.billing_email || target.email;

  // Start above whatever real numbering exists so the demo can never take a
  // number a genuine invoice was going to get.
  const year = new Date().getFullYear();
  const [{ max }] = await sql<{ max: number }[]>`
    select coalesce(max(substring(number from '(\\d+)$')::int), 0) as max
    from invoices
    where number like ${`${seller.invoice_prefix}-${year}-%`}
  `;
  let counter = Number(max) + 1;

  type SeedInvoice = {
    lines: { label: string; periods: number }[];
    status: "sent" | "paid";
    issuedDays: number;
    dueDays: number;
    paidCents: number;
    paidDays?: number;
  };

  const seedInvoices: SeedInvoice[] = [
    // Settled, two months back — gives the history something in it.
    {
      lines: [
        { label: "Website hosting & maintenance", periods: 1 },
        { label: "Business email", periods: 1 },
      ],
      status: "paid",
      issuedDays: -75,
      dueDays: -61,
      paidCents: 13400,
      paidDays: -70,
    },
    // Settled last month.
    {
      lines: [
        { label: "Website hosting & maintenance", periods: 1 },
        { label: "Business email", periods: 1 },
      ],
      status: "paid",
      issuedDays: -45,
      dueDays: -31,
      paidCents: 13400,
      paidDays: -40,
    },
    // OVERDUE and part-paid — the two states the overview has to handle well.
    {
      lines: [
        { label: "Website hosting & maintenance", periods: 1 },
        { label: "Business email", periods: 1 },
      ],
      status: "sent",
      issuedDays: -33,
      dueDays: -19,
      paidCents: 5000,
    },
    // Due soon, nothing paid.
    {
      lines: [{ label: "Domain registration", periods: 1 }],
      status: "sent",
      issuedDays: -4,
      dueDays: 10,
      paidCents: 0,
    },
  ];

  const created: { number: string; id: string }[] = [];

  for (const seed of seedInvoices) {
    const priced = seed.lines.map((want) => {
      const line = seedLines.find((l) => l.label === want.label);
      if (!line) throw new Error(`Unknown seed line: ${want.label}`);
      return {
        ...line,
        periods: want.periods,
        amount: line.unit * line.quantity * want.periods,
      };
    });

    const total = priced.reduce((sum, line) => sum + line.amount, 0);
    const issueDate = daysFromNow(seed.issuedDays);
    const dueDate = daysFromNow(seed.dueDays);
    const number = `${seller.invoice_prefix}-${year}-${String(counter).padStart(4, "0")}`;
    counter += 1;

    const [invoice] = await sql`
      insert into invoices (
        client_id, number, status, issue_date, due_date, currency,
        subtotal_cents, tax_cents, total_cents, amount_paid_cents,
        tax_rate_bps, tax_mode,
        seller_name, seller_abn, seller_address, seller_email,
        bill_to_name, bill_to_abn, bill_to_email, bill_to_address,
        public_token, notes, sent_at, paid_at, created_at
      ) values (
        ${target.id}, ${number}, ${seed.status},
        ${toDateString(issueDate)}, ${toDateString(dueDate)}, 'AUD',
        ${total}, 0, ${total}, ${seed.paidCents},
        0, 'none',
        ${seller.legal_name}, ${seller.abn}, ${seller.address}, ${seller.email},
        ${billToName}, ${target.billing_abn}, ${billToEmail}, ${target.billing_address},
        ${randomBytes(16).toString("hex")}, ${"Thanks for your business. Bank transfer details are below."},
        ${issueDate},
        ${seed.status === "paid" ? daysFromNow(seed.paidDays ?? seed.dueDays) : null},
        ${issueDate}
      )
      returning id
    `;

    for (const [position, line] of priced.entries()) {
      await sql`
        insert into invoice_lines (
          invoice_id, client_service_id, label, unit_amount_cents, quantity,
          periods, amount_cents, details, period_start, period_end, position
        ) values (
          ${invoice.id}, ${lineIds[line.label]}, ${line.label},
          ${line.unit}, ${line.quantity}, ${line.periods}, ${line.amount},
          ${line.items?.length ? line.items.join("\n") : null},
          ${toDateString(issueDate)},
          ${toDateString(daysFromNow(seed.issuedDays + 30 * line.periods))},
          ${position}
        )
      `;
    }

    // The ledger entry that settled it, plus — on the part-paid one — the
    // decline that came first. A portal that only ever shows successes is a
    // portal nobody checks after a card fails.
    if (seed.paidCents > 0) {
      await sql`
        insert into payments (
          client_id, invoice_id, provider, provider_ref, status, amount_cents,
          currency, description, paid_at, metadata, created_at
        ) values (
          ${target.id}, ${invoice.id}, 'stripe', ${`pi_demo_${randomBytes(6).toString("hex")}`},
          'succeeded', ${seed.paidCents}, 'AUD', ${`Invoice ${number}`},
          ${daysFromNow(seed.paidDays ?? seed.issuedDays + 3)},
          ${sql.json({ seed: DEMO_PAYMENT_TAG })},
          ${daysFromNow(seed.paidDays ?? seed.issuedDays + 3)}
        )
      `;
    }

    if (seed.status === "sent" && seed.paidCents > 0) {
      await sql`
        insert into payments (
          client_id, invoice_id, provider, provider_ref, status, amount_cents,
          currency, description, failure_reason, metadata, created_at
        ) values (
          ${target.id}, ${invoice.id}, 'stripe', ${`pi_demo_${randomBytes(6).toString("hex")}`},
          'failed', ${total - seed.paidCents}, 'AUD', ${`Invoice ${number}`},
          'card_declined: insufficient_funds',
          ${sql.json({ seed: DEMO_PAYMENT_TAG })},
          ${daysFromNow(seed.issuedDays + 2)}
        )
      `;
    }

    created.push({ number, id: invoice.id });
  }

  await sql.end();

  console.log(`\n✓ Demo data for ${target.name}`);
  console.log(`  ${seedLines.length} services, ${created.length} invoices`);
  for (const invoice of created) console.log(`    ${invoice.number}`);
  console.log("\n  Sign in at /portal/login to see it.");
  console.log("  Re-run this to reset the dates relative to today.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
