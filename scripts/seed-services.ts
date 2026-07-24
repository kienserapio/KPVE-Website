/**
 * Seeds the billable service catalogue so /admin/services isn't empty on day one.
 *
 *   npm run services:seed
 *
 * Idempotent: matches on slug, so re-running updates nothing and inserts only
 * what's missing. Prices here are placeholders — the point is that the team can
 * change them in the dashboard without a deploy, so edit them there, not here.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

type Seed = {
  name: string;
  slug: string;
  description: string;
  /** Price of ONE. A client on four mailboxes is one line with a quantity. */
  amountCents: number;
  interval: "one_off" | "weekly" | "monthly" | "quarterly" | "annually";
  /** What one unit is, so a line reads "4 mailboxes × $11". Null if uncounted. */
  unitLabel?: string;
};

const SEEDS: Seed[] = [
  {
    name: "Emails",
    slug: "emails",
    description: "Hosted business email, per mailbox.",
    amountCents: 1100,
    interval: "monthly",
    unitLabel: "mailbox",
  },
  {
    name: "Hosting",
    slug: "hosting",
    description: "Managed hosting, monitoring and uptime.",
    amountCents: 3000,
    interval: "monthly",
  },
  {
    name: "Support",
    slug: "support",
    description: "Ongoing fixes, updates and roadmapping.",
    amountCents: 50000,
    interval: "monthly",
  },
  {
    name: "Web Development",
    slug: "web-development",
    description: "Build work — billed as a project.",
    amountCents: 0,
    interval: "one_off",
  },
  {
    name: "Design",
    slug: "design",
    description: "Brand and product design — billed as a project.",
    amountCents: 0,
    interval: "one_off",
  },
  {
    name: "Business",
    slug: "business",
    description: "Strategy, positioning and go-to-market.",
    amountCents: 0,
    interval: "monthly",
  },
  {
    name: "Media",
    slug: "media",
    description: "Motion, photography and content production.",
    amountCents: 0,
    interval: "one_off",
  },
  {
    name: "Social Media",
    slug: "social-media",
    description: "Always-on content and community management.",
    amountCents: 0,
    interval: "monthly",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });

  let inserted = 0;
  for (const seed of SEEDS) {
    const rows = await sql`
      insert into services
        (name, slug, description, default_amount_cents, default_currency, default_interval,
         unit_label)
      values
        (${seed.name}, ${seed.slug}, ${seed.description}, ${seed.amountCents}, 'AUD',
         ${seed.interval}::billing_interval, ${seed.unitLabel ?? null})
      on conflict (slug) do nothing
      returning id
    `;
    if (rows.length) inserted++;
  }

  await sql.end();

  console.log(`\n✓ Service catalogue seeded — ${inserted} added, ${SEEDS.length - inserted} already there.`);
  console.log("  Edit prices at /admin/services");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
