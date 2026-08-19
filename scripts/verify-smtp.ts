/**
 * Checks that the SMTP credentials in .env.local can actually authenticate.
 *
 *   npm run mail:verify
 *   npm run mail:verify -- --send someone@example.com
 *   npm run mail:verify -- --html preview.html
 *
 * Without --send it connects and authenticates, then hangs up; nothing leaves.
 * Both the SSL port and the STARTTLS port are tried, because a host that blocks
 * outbound 465 (some office networks do) will still take 587, and knowing which
 * one works here is the difference between a config change and a mystery.
 *
 * With --send it delivers a REAL portal access email — the same template a
 * client receives, with an obviously fake code — so the thing being checked is
 * how it renders in a mail client, not merely whether the socket opened.
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

import { portalAccessEmail } from "@/lib/email/templates";

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

/**
 * A sample of the real thing. The code is not a real credential and cannot be —
 * it was never minted, so no row holds its hash and it will not sign anyone in.
 */
function sample(to: string) {
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
    console.log("  The code in it is a sample and will not sign anyone in.\n");
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
