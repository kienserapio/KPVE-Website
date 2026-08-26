/**
 * Checks that the SMTP credentials in .env.local can actually authenticate.
 *
 *   npm run mail:verify
 *   npm run mail:verify -- --send someone@example.com
 *   npm run mail:verify -- --html preview.html
 *   npm run mail:verify -- --template invoice --html preview.html
 *
 * Without --send it connects and authenticates, then hangs up; nothing leaves.
 * Both the SSL port and the STARTTLS port are tried, because a host that blocks
 * outbound 465 (some office networks do) will still take 587, and knowing which
 * one works here is the difference between a config change and a mystery.
 *
 * With --send it delivers a REAL email — the same template a client receives,
 * built from obviously fake data — so the thing being checked is how it renders
 * in a mail client, not merely whether the socket opened. --template picks
 * which one: `access` (the default) or `invoice`.
 *
 * With --html it writes that same HTML to a file instead, which is how you
 * iterate on a template without putting another message through a real inbox.
 *
 * Both honour NEXT_PUBLIC_APP_URL, so prefix it when a sample should carry the
 * production links rather than localhost:
 *   NEXT_PUBLIC_APP_URL=https://kpve.com npm run mail:verify -- --send you@you.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";

import nodemailer from "nodemailer";

import { invoiceEmail, portalAccessEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/utils";

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;

if (!host || !user || !pass) {
  console.error("Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in .env.local first.");
  process.exit(1);
}

async function attempt(port: number, secure: boolean): Promise<boolean> {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });

  try {
    await transport.verify();
    console.log(`  OK    ${host}:${port}  ${secure ? "SSL" : "STARTTLS"}`);
    return true;
  } catch (error) {
    console.log(
      `  FAIL  ${host}:${port}  ${secure ? "SSL" : "STARTTLS"}  — ${(error as Error).message}`,
    );
    return false;
  } finally {
    transport.close();
  }
}

/** Which template the run is exercising — `access` unless asked otherwise. */
function which(): string {
  const flag = process.argv.indexOf("--template");
  return flag === -1 ? "access" : process.argv[flag + 1];
}

/**
 * A sample of the real thing. The code is not a real credential and cannot be —
 * it was never minted, so no row holds its hash and it will not sign anyone in.
 * The invoice sample's token is likewise fake: /invoice/<token> will 404 on it.
 */
function sample(to: string) {
  if (which() === "invoice") {
    const day = 24 * 60 * 60 * 1000;
    return invoiceEmail({
      clientName: "Sample Recipient",
      number: "INV-0000",
      status: "sent",
      dueDate: new Date(Date.now() + 14 * day),
      currency: "AUD",
      subtotalCents: 132000,
      taxCents: 13200,
      totalCents: 145200,
      amountPaidCents: 0,
      taxRateBps: 1000,
      taxMode: "exclusive",
      poNumber: "PO-4471",
      notes: "Thanks for your business — anything on this invoice can be queried by reply.",
      lines: [
        {
          label: "Managed hosting",
          period: "1 March 2026 – 28 February 2027",
          description: "Includes daily backups and the staging site.",
          items: ["example.com.au", "staging.example.com.au"],
          amountCents: 108000,
        },
        {
          label: "Domain renewal — example.com.au",
          period: null,
          description: "Renewed for two years at the locked-in rate.",
          items: [],
          amountCents: 24000,
        },
      ],
      payUrl: `${appUrl()}/invoice/${"0".repeat(32)}`,
      payable: true,
      bankDetails: {
        bankName: "Sample Bank",
        accountName: "KPVE Pty Ltd",
        bsb: "000-000",
        accountNumber: "0000 0000",
      },
    });
  }

  if (which() !== "access") {
    console.error(`\n--template takes "access" or "invoice", not "${which()}".\n`);
    process.exit(1);
  }

  return portalAccessEmail({
    name: "Sample Recipient",
    email: to,
    code: "SAMP-LE00-0000-0000-0000-0000",
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    reissued: false,
  });
}

async function sendSample(to: string, port: number, secure: boolean) {
  const { subject, text, html } = sample(to);

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    const info = await transport.sendMail({
      from: process.env.MAIL_FROM || user,
      to,
      subject: `[test] ${subject}`,
      text,
      html,
    });
    console.log(`\n  Sent to ${to} — ${info.messageId}`);
    // Both samples carry a credential-shaped thing that is not one, and saying
    // which keeps a test send from being read as a real one.
    console.log(
      which() === "invoice"
        ? "  The invoice in it is a sample; its link points at a token that does not exist.\n"
        : "  The code in it is a sample and will not sign anyone in.\n",
    );
  } finally {
    transport.close();
  }
}

async function main() {
  console.log(`\nAuthenticating as ${user}\n`);
  const ssl = await attempt(465, true);
  const starttls = await attempt(587, false);

  if (!ssl && !starttls) {
    console.log(
      "\nNeither port authenticated — check the password, or whether the mailbox exists.\n",
    );
    process.exit(1);
  }

  console.log("\nCredentials accepted.");

  const htmlFlag = process.argv.indexOf("--html");
  if (htmlFlag !== -1) {
    const path = process.argv[htmlFlag + 1];
    if (!path) {
      console.error("\n--html needs a path.\n");
      process.exit(1);
    }
    writeFileSync(path, sample("sample@example.com").html);
    console.log(`\n  Wrote ${path}`);
  }

  const flag = process.argv.indexOf("--send");
  const to = flag === -1 ? null : process.argv[flag + 1];
  if (flag !== -1 && !to) {
    console.error("\n--send needs an address: npm run mail:verify -- --send you@example.com\n");
    process.exit(1);
  }
  if (to) await sendSample(to, ssl ? 465 : 587, ssl);

  process.exit(0);
}

main();
