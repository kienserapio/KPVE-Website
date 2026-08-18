/**
 * Issues (or reissues) a client's portal access code.
 *
 * There is no public signup — a client can only get in with a code a staff
 * member hands them.
 *
 *   npm run portal:issue -- --client "Rare Gem" --email dimitrios@raregem.com.au --name "Dimitrios Kappatos"
 *
 * --client takes the client's UUID (the last part of its /admin/clients URL) or
 * a piece of its name, as long as that matches exactly one client.
 *
 * The code is printed ONCE and never stored — only its hash is. Reissuing
 * replaces the old code and signs out any session it had opened.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

// Scripts normally avoid @/lib because it is server-only and this runs outside
// Next. lib/auth/portal-code.ts is deliberately not server-only, so the CLI and
// the sign-in path share one definition of the code format instead of drifting.
import { generateAccessCode } from "../lib/auth/portal-code";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  let current: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--")) {
      current = arg.slice(2);
      out[current] = "";
    } else if (current) {
      // Join bare tokens so an unquoted --name Their Name still works.
      out[current] = out[current] ? `${out[current]} ${arg}` : arg;
    }
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const { client, email, name } = parseArgs();

  if (!client || !email || !name) {
    console.error(
      'Usage: npm run portal:issue -- --client <id or name> --email them@example.com --name "Their Name"',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local.");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const sql = postgres(connectionString, { prepare: false });

  const matches = UUID.test(client.trim())
    ? await sql`select id, name from clients where id = ${client.trim()}`
    : await sql`
        select id, name from clients
        where name ilike ${`%${client.trim()}%`}
           or company ilike ${`%${client.trim()}%`}
        order by name
        limit 10
      `;

  if (matches.length === 0) {
    await sql.end();
    console.error(`No client matches "${client}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    await sql.end();
    console.error(`"${client}" matches ${matches.length} clients:`);
    for (const row of matches) console.error(`  ${row.id}  ${row.name}`);
    console.error("Re-run with the id of the one you meant.");
    process.exit(1);
  }

  const target = matches[0];
  const issued = generateAccessCode();

  const [row] = await sql`
    insert into client_users (
      client_id, email, name, code_selector, code_hash, code_issued_at, code_expires_at
    )
    values (
      ${target.id}, ${normalizedEmail}, ${name.trim()},
      ${issued.selector}, ${issued.codeHash}, now(), ${issued.expiresAt}
    )
    on conflict (client_id, email) do update
      set name = excluded.name,
          code_selector = excluded.code_selector,
          code_hash = excluded.code_hash,
          code_issued_at = excluded.code_issued_at,
          code_expires_at = excluded.code_expires_at,
          failed_attempts = 0,
          locked_until = null,
          sessions_valid_from = now(),
          updated_at = now()
    returning id, email, name, status
  `;

  await sql.end();

  console.log(`\n✓ Portal access for ${row.name} <${row.email}> — ${target.name}`);
  console.log(`  Code: ${issued.code}`);
  console.log(`  Expires: ${issued.expiresAt.toLocaleDateString("en-AU")}`);
  console.log("  Sign in at /portal/login");
  console.log(
    "\n  This code is shown once. It is stored hashed, so it cannot be looked up —",
  );
  console.log("  run this again to issue a new one.");

  if (row.status === "disabled") {
    console.log(
      "\n  ! This login is DISABLED, so the code will not work until it is re-enabled.",
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
