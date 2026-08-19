import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/* ---------------------------------------------------------------------------
   Sending mail from the server.

   The same shape as lib/payments: presence of the credentials IS the switch.
   With SMTP_HOST, SMTP_USER and SMTP_PASSWORD set the app sends for itself;
   without them every call is a no-op that reports itself as unsent, and staff
   fall back to the mailto: handoff the UI still offers. No code change, no flag.

   Nothing here ever throws. An email is a notification about something that has
   already happened — a code minted, an invoice issued — and a mail server
   having a bad minute must never roll that back or surface as "Something went
   wrong" on a write that in fact succeeded. Callers get a result and decide
   what to say about it.
--------------------------------------------------------------------------- */

export type MailResult =
  | { sent: true }
  /** `not_configured` is a different conversation from `failed` — the UI says so. */
  | { sent: false; reason: "not_configured" | "failed"; error?: string };

export type MailMessage = {
  to: string;
  subject: string;
  /** Always required. HTML is the enhancement, never the only copy. */
  text: string;
  html?: string;
  replyTo?: string;
};

export function mailIsConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
  );
}

/**
 * Who the mail comes from. MAIL_FROM carries the display name — "KPVE
 * <outgoing@kpve.com>" — and falls back to the authenticating mailbox, because
 * a From that isn't the account we authenticated as is the fastest way into a
 * spam folder.
 */
function from(): string {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "";
}

/**
 * One transport for the process, not one per send.
 *
 * Nodemailer holds the TCP connection open and queues onto it, so a burst of
 * mail costs one TLS handshake rather than one each. Lazily built: constructing
 * it at import time would run during the build, where the env is not the
 * runtime env.
 */
let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (transport) return transport;

  const port = Number(process.env.SMTP_PORT || 465);

  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is TLS from the first byte; 587 opens in the clear and upgrades with
    // STARTTLS. Getting this pair wrong is the classic "it just hangs".
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });

  return transport;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!mailIsConfigured()) return { sent: false, reason: "not_configured" };

  try {
    await getTransport().sendMail({
      from: from(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    });
    return { sent: true };
  } catch (error) {
    // Logged, never rethrown — see the header. The caller reports "we couldn't
    // email it", which is true and actionable; the stack is for us.
    console.error("[sendMail]", message.subject, error);
    return {
      sent: false,
      reason: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
