/**
 * Records this month's MRR/ARR so the revenue trend has real history.
 *
 *   npm run revenue:snapshot
 *
 * Upserts one row per currency for the current month, so running it daily is
 * safe and the month closes on its final value. Run it from cron once a day;
 * the Revenue page also captures on its first view of the day, which covers a
 * team that logs in regularly but leaves gaps if nobody does.
 *
 * Without snapshots the chart still draws — it reconstructs months from service
 * start and cancel dates — but a reconstruction can't see a pause or a
 * mid-month reprice, and the chart marks those months as estimates.
 *
 * The interval factors below are the third copy of the rule in lib/billing.ts
 * (the second is the SQL in lib/dal/clients.ts). They exist because this script
 * runs outside Next and cannot import the server-only DAL. Change one, change
 * all three: weekly is 52/12, and one-offs are never recurring revenue.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const MONTHLY_EQUIVALENT = `
  case "interval"
    when 'weekly'    then amount_cents * 52.0 / 12.0
    when 'monthly'   then amount_cents
    when 'quarterly' then amount_cents / 3.0
    when 'annually'  then amount_cents / 12.0
    else 0
  end
`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }

  const sql = postgres(connectionString, { max: 1, prepare: false });

  const rows = await sql<
    {
      currency: string;
      mrr_cents: number;
      arr_cents: number;
      one_off_cents: number;
      active_lines: number;
      paying_clients: number;
    }[]
  >`
    with totals as (
      select
        upper(currency) as currency,
        coalesce(round(sum(${sql.unsafe(MONTHLY_EQUIVALENT)})), 0)::int as mrr_cents,
        coalesce(sum(case when "interval" = 'one_off' then amount_cents else 0 end), 0)::int
          as one_off_cents,
        count(*)::int as active_lines,
        count(distinct client_id)::int as paying_clients
      from client_services
      where status = 'active'
      group by upper(currency)
    )
    insert into revenue_snapshots
      (period, currency, mrr_cents, arr_cents, one_off_cents, active_lines, paying_clients, captured_at)
    select
      date_trunc('month', now())::date,
      currency,
      mrr_cents,
      mrr_cents * 12,
      one_off_cents,
      active_lines,
      paying_clients,
      now()
    from totals
    on conflict (period, currency) do update set
      mrr_cents      = excluded.mrr_cents,
      arr_cents      = excluded.arr_cents,
      one_off_cents  = excluded.one_off_cents,
      active_lines   = excluded.active_lines,
      paying_clients = excluded.paying_clients,
      captured_at    = excluded.captured_at
    returning currency, mrr_cents, arr_cents, one_off_cents, active_lines, paying_clients
  `;

  await sql.end();

  const month = new Date().toISOString().slice(0, 7);

  if (rows.length === 0) {
    console.log(`\n✓ ${month}: no active services — nothing to record.`);
    return;
  }

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);

  console.log(`\n✓ Snapshot recorded for ${month}:`);
  for (const row of rows) {
    console.log(
      `  ${row.currency}  MRR ${money(row.mrr_cents, row.currency)}` +
        `  ARR ${money(row.arr_cents, row.currency)}` +
        `  one-off ${money(row.one_off_cents, row.currency)}` +
        `  (${row.active_lines} lines, ${row.paying_clients} clients)`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
