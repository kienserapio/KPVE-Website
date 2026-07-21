/**
 * Creates or updates a KPVE staff login.
 *
 * There is no public signup — this script is the only way an account is made.
 *
 *   npm run staff:create -- --email you@kpve.com --name "Your Name"
 *
 * Prompts for the password so it never lands in shell history. Re-running with
 * an existing email resets that user's password.
 *
 * Also accepts piped input for scripted use:
 *   printf 'pass\npass\n' | npx tsx scripts/create-staff-user.ts --email … --name …
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import postgres from "postgres";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  let current: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--")) {
      current = arg.slice(2);
      out[current] = "";
    } else if (current) {
      // Join bare tokens so an unquoted --name Your Name still works.
      out[current] = out[current] ? `${out[current]} ${arg}` : arg;
    }
  }
  return out;
}

/**
 * Reads two lines from stdin.
 *
 * readline's promise-based question() never resolves when stdin hits EOF on a
 * pipe, and Node then exits 0 with the work half-done. Driving the 'line' and
 * 'close' events directly avoids that.
 */
function readTwoLines(prompts: [string, string]): Promise<[string, string]> {
  return new Promise((resolve, reject) => {
    const isTty = Boolean(stdin.isTTY);
    const rl = createInterface({ input: stdin, output: stdout, terminal: isTty });
    const lines: string[] = [];

    // Don't echo the password back to the terminal.
    if (isTty) {
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      const original = rlAny._writeToOutput.bind(rl);
      rlAny._writeToOutput = (str: string) => {
        if (str.includes(prompts[0]) || str.includes(prompts[1])) original(str);
        else original("");
      };
    }

    stdout.write(prompts[0]);

    rl.on("line", (line) => {
      lines.push(line);
      if (lines.length === 1) {
        if (isTty) stdout.write("\n");
        stdout.write(prompts[1]);
      } else if (lines.length >= 2) {
        if (isTty) stdout.write("\n");
        rl.close();
      }
    });

    rl.on("close", () => {
      if (lines.length < 2) {
        reject(new Error("Input ended before both passwords were entered."));
        return;
      }
      resolve([lines[0], lines[1]]);
    });
  });
}

async function main() {
  const { email, name } = parseArgs();

  if (!email || !name) {
    console.error(
      'Usage: npm run staff:create -- --email you@kpve.com --name "Your Name"',
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Check .env.local.");
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [password, confirm] = await readTwoLines([
    "Password (min 12 chars): ",
    "Confirm password: ",
  ]);

  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });
  const passwordHash = await bcrypt.hash(password, 12);

  const [row] = await sql`
    insert into staff_users (email, password_hash, name)
    values (${normalizedEmail}, ${passwordHash}, ${name.trim()})
    on conflict (email) do update
      set password_hash = excluded.password_hash,
          name = excluded.name,
          is_active = true,
          updated_at = now()
    returning id, email, name
  `;

  await sql.end();

  console.log(`\n✓ Staff user ready: ${row.name} <${row.email}>`);
  console.log("  Sign in at /login");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
