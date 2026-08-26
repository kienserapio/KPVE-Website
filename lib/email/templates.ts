import { formatMoney, formatTaxRate } from "@/lib/billing";
import { appUrl } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The mail the app sends, as data.

   Every template returns subject, text and html together so no caller can send
   one without the others. The text part is not a fallback nobody reads — it is
   what a screen reader, a watch and a locked-down corporate client all show, so
   it carries everything the HTML carries, including the walkthrough.

   THE RULES OF THIS FILE, all of them forced by mail clients rather than taste:

   - Tables for layout. Outlook on Windows renders through Word, which has no
     flexbox, no grid and no reliable div background.
   - Inline styles only. Gmail strips <style> blocks in some views, and a gold
     heading that arrives as unstyled black text is worse than never styling it.
   - bgcolor="" alongside every background style, for the same Word engine.
   - No images. Not a logo, not a spacer, not a tracking pixel — most clients
     block remote images by default, so a design that needs one arrives broken,
     and the wordmark is type anyway.
   - No web fonts. Bricolage and Sora are the site's faces and cannot be loaded
     here; the stack falls through to the host's own grotesque, which is the
     closest honest match.

   The palette is the site's, from app/globals.css. Dark by design, so the
   colour-scheme meta tags below tell Apple Mail and Gmail not to "helpfully"
   invert it into something we never designed.
--------------------------------------------------------------------------- */

/* Surfaces */
const INK = "#050505";
const SURFACE = "#101010";
const SURFACE_2 = "#1a1a1a";
/* Lines */
const LINE = "#202020";
const LINE_3 = "#292929";
/* Brand gold */
const GOLD = "#bd8b28";
const GOLD_BRIGHT = "#e9c04b";
const GOLD_CREAM = "#fff1ca";
/* Text */
const WHITE = "#f5f5f5";
const MUTED = "#8c8c8c";
const MUTED_3 = "#b8b8b8";

const SANS =
  "'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

export type Email = { subject: string; text: string; html: string };

function formatDay(date: Date): string {
  // Sydney, to match every other date the client is shown — see lib/utils.
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

/**
 * Interpolated values go through this before they reach the HTML part. A
 * client's name is staff-entered rather than public, so this is not the front
 * line — but a name with an ampersand in it should render as a name, and the
 * one place that reliably happens is here.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The page the whole email sits in: dark ground, one centred card. */
function shell(preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>KPVE</title>
</head>
<body style="margin:0;padding:0;background:${INK};color:${WHITE};font-family:${SANS};-webkit-font-smoothing:antialiased;">
  <!-- The line shown in the inbox list beside the subject. Hidden in the body
       itself, then padded so the client doesn't pull quoted text in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <div style="display:none;max-height:0;overflow:hidden;">&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE}" style="width:100%;max-width:560px;background:${SURFACE};border:1px solid ${LINE};border-radius:14px;">

        <!-- Wordmark. Type, not an image, so a client with images off still
             sees the brand rather than a grey placeholder box. -->
        <tr><td style="padding:30px 32px 0;">
          <p style="margin:0;font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:5px;color:${GOLD};">KPVE</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;">
            <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 32px 32px;">${body}</td></tr>
      </table>

      <p style="margin:20px 0 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED};">
        KPVE &middot; <a href="${appUrl()}" style="color:${MUTED};text-decoration:underline;">kpve.com</a>
      </p>

    </td></tr>
  </table>
</body></html>`;
}

/** A gold call-to-action. A table, because Word ignores padding on an anchor. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
    <tr><td align="center" bgcolor="${GOLD}" style="background:${GOLD};border-radius:9px;">
      <a href="${href}" style="display:inline-block;padding:13px 30px;font-family:${SANS};font-size:15px;font-weight:700;color:${INK};text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

/** One row of the walkthrough: a gold heading over a line of explanation. */
function guideRow(title: string, description: string, last = false): string {
  return `<tr><td style="padding:0 0 ${last ? "0" : "16px"};">
    <p style="margin:0 0 3px;font-family:${SANS};font-size:14px;font-weight:700;color:${GOLD_BRIGHT};">${escapeHtml(title)}</p>
    <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">${escapeHtml(description)}</p>
  </td></tr>`;
}

/**
 * What the four sections of the portal are for, in the order the sidebar lists
 * them. Kept as data next to the template because it is the same answer in the
 * HTML and the text part, and two copies of it would drift the first time a
 * page is renamed. Mirrors NAV in components/portal/PortalShell.tsx.
 */
const PORTAL_GUIDE: Array<{ title: string; description: string }> = [
  {
    title: "Overview",
    description:
      "Where you land. Anything owing, when it's due, and what's renewing next.",
  },
  {
    title: "Services",
    description:
      "Everything we run for you — hosting, domains, design, development — with what each costs and the date it renews.",
  },
  {
    title: "Invoices",
    description:
      "Every invoice we've issued. Open one to pay it by card, or download the PDF for your records or your accountant.",
  },
  {
    title: "Payments",
    description:
      "Your receipt history: everything that has been paid, and anything that didn't go through.",
  },
];

/**
 * The portal invitation, and the reissue — one template, because they differ
 * only in whether the reader has been here before, and a second template would
 * be a second place for the sign-in URL to go stale.
 */
export function portalAccessEmail(input: {
  name: string;
  email: string;
  code: string;
  expiresAt: Date;
  /** True when this replaces a code they already had. */
  reissued: boolean;
}): Email {
  const loginUrl = `${appUrl()}/portal/login`;
  const expires = formatDay(input.expiresAt);

  const subject = input.reissued ? "Your new KPVE access code" : "Your KPVE account";

  const opening = input.reissued
    ? "Here's a new access code for your KPVE account. The one you had before has stopped working."
    : "Your KPVE account is ready. It's where you can see everything we run for you, what it costs, and anything that's owing — in one place, any time.";

  const text = [
    `Hi ${input.name},`,
    "",
    opening,
    "",
    "SIGNING IN",
    `  1. Go to ${loginUrl}`,
    `  2. Email:       ${input.email}`,
    `  3. Access code: ${input.code}`,
    "",
    "The code is not case-sensitive and the dashes don't matter — type it or paste",
    "it however it's easiest.",
    "",
    "FINDING YOUR WAY AROUND",
    ...PORTAL_GUIDE.flatMap((item) => [
      "",
      `  ${item.title.toUpperCase()}`,
      `    ${item.description}`,
    ]),
    "",
    "PAYING AN INVOICE",
    "  Open Invoices, choose the one you want to settle, and press Pay now. That",
    "  opens a secure card checkout. If you've already part-paid it, you're only",
    "  charged the balance. Bank transfer details are on the invoice itself if you",
    "  would rather pay that way.",
    "",
    "A FEW THINGS WORTH KNOWING",
    "  - The portal is read-only apart from paying. Nothing you do there can",
    "    change a price or cancel a service — just reply to this email and we'll",
    "    sort it out.",
    "  - It works on your phone, and you can switch between light and dark.",
    `  - Your code works until ${expires}. After that, ask us and we'll issue a`,
    "    new one.",
    "",
    "Keep this email, or save the code somewhere safe — we can't look it up later,",
    "only replace it. If you weren't expecting this, reply and let us know.",
    "",
    "KPVE",
    appUrl(),
  ].join("\n");

  const html = shell(
    input.reissued
      ? "A new access code for your KPVE account."
      : "Your access code, and a quick tour of what's inside.",
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:23px;line-height:1.25;font-weight:700;color:${WHITE};">
       ${input.reissued ? "Your new access code" : "Your KPVE account is ready"}
     </h1>

     <p style="margin:0 0 10px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">Hi ${escapeHtml(input.name)},</p>
     <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">${escapeHtml(opening)}</p>

     <!-- The credential. Given its own surface because it is the one thing in
          this email the reader has to come back and find again. -->
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border:1px solid ${LINE_3};border-radius:11px;margin:0 0 24px;">
       <tr><td style="padding:20px 22px;">
         <p style="margin:0 0 5px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">Your email</p>
         <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;color:${WHITE};">${escapeHtml(input.email)}</p>
         <p style="margin:0 0 7px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">Your access code</p>
         <p style="margin:0;font-family:${MONO};font-size:19px;font-weight:700;letter-spacing:1.5px;color:${GOLD_CREAM};word-break:break-all;">${escapeHtml(input.code)}</p>
       </td></tr>
     </table>

     ${button(loginUrl, "Sign in to your account")}

     <p style="margin:0 0 30px;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
       The code isn't case-sensitive and the dashes don't matter — type it or paste it, whichever is easier.
     </p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
       <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
     </table>

     <p style="margin:0 0 18px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">Finding your way around</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
       ${PORTAL_GUIDE.map((item, i) =>
         guideRow(item.title, item.description, i === PORTAL_GUIDE.length - 1),
       ).join("")}
     </table>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border-left:2px solid ${GOLD};border-radius:0 8px 8px 0;margin:0 0 26px;">
       <tr><td style="padding:16px 18px;">
         <p style="margin:0 0 4px;font-family:${SANS};font-size:14px;font-weight:700;color:${WHITE};">Paying an invoice</p>
         <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">
           Open <strong style="color:${WHITE};font-weight:600;">Invoices</strong>, pick the one you want to settle and press <strong style="color:${WHITE};font-weight:600;">Pay now</strong> for a secure card checkout. Part-paid already? You're only charged the balance. Bank transfer details are on the invoice itself.
         </p>
       </td></tr>
     </table>

     <p style="margin:0 0 18px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">A few things worth knowing</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
       ${[
         "The portal is read-only apart from paying — nothing you do there can change a price or cancel a service. Just reply to this email and we'll sort it out.",
         "It works on your phone, and you can switch between light and dark.",
         `Your code works until ${expires}. After that, ask us and we'll issue a new one.`,
       ]
         .map(
           (line, i, all) => `<tr>
           <td width="14" valign="top" style="padding:0 0 ${i === all.length - 1 ? "0" : "10px"};font-family:${SANS};font-size:14px;line-height:1.55;color:${GOLD};">&bull;</td>
           <td valign="top" style="padding:0 0 ${i === all.length - 1 ? "0" : "10px"};font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">${escapeHtml(line)}</td>
         </tr>`,
         )
         .join("")}
     </table>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
       <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
     </table>

     <p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
       Keep this email, or save the code somewhere safe — we can't look it up later, only replace it.
     </p>
     <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">
       If you weren't expecting this, reply and let us know.
     </p>`,
  );

  return { subject, text, html };
}

/* ---------------------------------------------------------------------------
   AutoPay

   Three emails, and between them they are the whole reason AutoPay is allowed
   to charge a card with nobody watching: the client is told before, told after,
   and told what to do when it fails. The card networks require the first; the
   third is what keeps a declined card from becoming a lost client.
--------------------------------------------------------------------------- */

/** "Visa ending 4242", or a flat "your saved card" when we never got the digits. */
function describeCard(brand: string | null, last4: string | null): string {
  if (!last4) return "your saved card";
  const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  return `${name} ending ${last4}`;
}

/**
 * The warning shot, a few days before the charge.
 *
 * The most important line in it is the last one: how to stop it. An AutoPay
 * notice that a client cannot act on is not a notice, it is an announcement.
 */
export function autopayNoticeEmail(input: {
  clientName: string;
  number: string;
  amount: string;
  dueDate: Date;
  cardBrand: string | null;
  cardLast4: string | null;
}): Email {
  const due = formatDay(input.dueDate);
  const card = describeCard(input.cardBrand, input.cardLast4);
  const invoiceUrl = `${appUrl()}/portal/invoices`;
  const autopayUrl = `${appUrl()}/portal/autopay`;

  const subject = `We'll charge ${input.amount} on ${due} — ${input.number}`;

  const text = [
    `Hi ${input.clientName},`,
    "",
    `Invoice ${input.number} for ${input.amount} falls due on ${due}, and AutoPay is on,`,
    `so we'll charge ${card} on that date. You don't need to do anything.`,
    "",
    "IF YOU'D RATHER WE DIDN'T",
    `  Turn AutoPay off and the charge won't happen: ${autopayUrl}`,
    "  It takes effect straight away, and your card stays saved for next time.",
    "",
    "THE INVOICE",
    `  ${invoiceUrl}`,
    "",
    "If anything on it looks wrong, reply to this email before the due date and",
    "we'll sort it out first.",
    "",
    "KPVE",
    appUrl(),
  ].join("\n");

  const html = shell(
    `${input.amount} on ${due} from ${card}`,
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:23px;font-weight:700;color:${WHITE};">A payment is coming up</h1>
     <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">Hi ${escapeHtml(input.clientName)},</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border-radius:10px;margin:0 0 24px;">
       <tr><td style="padding:18px 20px;">
         <p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">Invoice ${escapeHtml(input.number)}</p>
         <p style="margin:0 0 4px;font-family:${MONO};font-size:26px;color:${GOLD_CREAM};">${escapeHtml(input.amount)}</p>
         <p style="margin:0;font-family:${SANS};font-size:14px;color:${MUTED_3};">from ${escapeHtml(card)} on ${escapeHtml(due)}</p>
       </td></tr>
     </table>

     <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">
       You don't need to do anything — this is just so the charge isn't a surprise.
     </p>

     ${button(invoiceUrl, "View the invoice")}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
       <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
     </table>

     <p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">If you'd rather we didn't</p>
     <p style="margin:0 0 8px;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">
       <a href="${autopayUrl}" style="color:${GOLD_BRIGHT};text-decoration:underline;">Turn AutoPay off</a>
       and this charge won't happen. It stops straight away, and your card stays saved for whenever you want it back on.
     </p>
     <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">
       If something on the invoice looks wrong, reply to this email before ${escapeHtml(due)} and we'll sort it out first.
     </p>`,
  );

  return { subject, text, html };
}

/** The receipt. Short on purpose — the money already moved. */
export function autopayReceiptEmail(input: {
  clientName: string;
  number: string;
  amount: string;
  paidAt: Date;
  cardBrand: string | null;
  cardLast4: string | null;
}): Email {
  const paid = formatDay(input.paidAt);
  const card = describeCard(input.cardBrand, input.cardLast4);
  const invoiceUrl = `${appUrl()}/portal/invoices`;

  const subject = `Paid — ${input.number}, ${input.amount}`;

  const text = [
    `Hi ${input.clientName},`,
    "",
    `We charged ${card} ${input.amount} for invoice ${input.number} on ${paid}.`,
    "It's paid — nothing further to do.",
    "",
    "YOUR RECORDS",
    `  The invoice and a PDF of it: ${invoiceUrl}`,
    "",
    "KPVE",
    appUrl(),
  ].join("\n");

  const html = shell(
    `${input.amount} paid from ${card}`,
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:23px;font-weight:700;color:${WHITE};">Paid, thank you</h1>
     <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">Hi ${escapeHtml(input.clientName)},</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border-radius:10px;margin:0 0 24px;">
       <tr><td style="padding:18px 20px;">
         <p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">Invoice ${escapeHtml(input.number)}</p>
         <p style="margin:0 0 4px;font-family:${MONO};font-size:26px;color:${GOLD_CREAM};">${escapeHtml(input.amount)}</p>
         <p style="margin:0;font-family:${SANS};font-size:14px;color:${MUTED_3};">${escapeHtml(card)} &middot; ${escapeHtml(paid)}</p>
       </td></tr>
     </table>

     ${button(invoiceUrl, "View or download the invoice")}

     <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">
       Charged automatically because AutoPay is on for your account. You can turn it off at any time from your
       <a href="${appUrl()}/portal/autopay" style="color:${MUTED};text-decoration:underline;">account page</a>.
     </p>`,
  );

  return { subject, text, html };
}

/**
 * The card said no.
 *
 * Deliberately not an apology and not an alarm. It says what happened, what it
 * means (nothing has been taken), and gives one link that fixes it. The reason
 * is described in plain words rather than passed through from the processor —
 * "authentication_required" means nothing to the person holding the card.
 */
export function autopayFailedEmail(input: {
  clientName: string;
  number: string;
  amount: string;
  code: string;
  cardBrand: string | null;
  cardLast4: string | null;
  /** True once the run has given up and switched AutoPay off. */
  suspended: boolean;
}): Email {
  const card = describeCard(input.cardBrand, input.cardLast4);
  const payUrl = `${appUrl()}/portal/invoices`;
  const autopayUrl = `${appUrl()}/portal/autopay`;
  const reason = FAILURE_REASONS[input.code] ?? "The payment didn't go through.";

  const subject = `We couldn't charge your card — ${input.number}`;

  const text = [
    `Hi ${input.clientName},`,
    "",
    `We tried to charge ${card} ${input.amount} for invoice ${input.number}, and it didn't go through.`,
    reason,
    "",
    "NOTHING HAS BEEN TAKEN",
    "  The invoice is still open and we haven't tried again.",
    "",
    "TO PAY IT",
    `  ${payUrl}`,
    "  Pay it by card there, or use a different card — it only takes a moment.",
    "",
    input.suspended
      ? [
          "AUTOPAY IS OFF FOR NOW",
          `  After a few failed attempts we've switched it off so it stops trying.`,
          `  Save a working card and turn it back on here: ${autopayUrl}`,
        ].join("\n")
      : [
          "AUTOPAY IS STILL ON",
          `  We won't retry this charge, but we'll use your card again for the next invoice.`,
          `  Update it here: ${autopayUrl}`,
        ].join("\n"),
    "",
    "If you think this is wrong, reply to this email and we'll take a look.",
    "",
    "KPVE",
    appUrl(),
  ].join("\n");

  const html = shell(
    `${input.amount} on ${input.number} didn't go through`,
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:23px;font-weight:700;color:${WHITE};">We couldn't charge your card</h1>
     <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">Hi ${escapeHtml(input.clientName)},</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-left:3px solid ${GOLD};">
       <tr><td style="padding:2px 0 2px 16px;">
         <p style="margin:0 0 4px;font-family:${SANS};font-size:15px;line-height:1.6;color:${WHITE};">
           ${escapeHtml(input.amount)} for invoice ${escapeHtml(input.number)}, from ${escapeHtml(card)}.
         </p>
         <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">${escapeHtml(reason)}</p>
       </td></tr>
     </table>

     <p style="margin:0 0 24px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">
       <strong style="color:${WHITE};">Nothing has been taken.</strong> The invoice is still open, and we haven't tried again.
     </p>

     ${button(payUrl, "Pay the invoice")}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
       <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
     </table>

     <p style="margin:0 0 6px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">
       ${input.suspended ? "AutoPay is off for now" : "AutoPay is still on"}
     </p>
     <p style="margin:0 0 8px;font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">
       ${
         input.suspended
           ? `After a few failed attempts we've switched it off so it stops trying. <a href="${autopayUrl}" style="color:${GOLD_BRIGHT};text-decoration:underline;">Save a working card</a> to turn it back on.`
           : `We won't retry this charge, but we'll use your card again for the next invoice. <a href="${autopayUrl}" style="color:${GOLD_BRIGHT};text-decoration:underline;">Update it here</a> if it's changed.`
       }
     </p>
     <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">
       If you think this is wrong, reply to this email and we'll take a look.
     </p>`,
  );

  return { subject, text, html };
}

/**
 * Processor codes, in words the cardholder can act on.
 *
 * `authentication_required` is the one that matters most and the one nobody
 * outside payments has heard of: the bank wanted the client to confirm the
 * payment, and there was nobody there to do it. That is not a decline, and
 * saying "your card was declined" would send them to their bank for nothing.
 */
const FAILURE_REASONS: Record<string, string> = {
  authentication_required:
    "Your bank wanted you to confirm the payment, and an automatic charge can't ask you to. Paying it yourself will work.",
  insufficient_funds: "There weren't enough funds available on the card.",
  card_declined: "Your bank declined the charge.",
  expired_card: "The card has expired.",
  incorrect_cvc: "The card's security code was rejected.",
  processing_error: "The card network had a problem processing it.",
  card_not_supported: "That card doesn't support this kind of payment.",
};

/* ---------------------------------------------------------------------------
   The invoice, in the inbox.

   Sent by a staff member pressing "Email it" on the invoice — the same act that
   used to hand them a mailto: draft to finish by hand. What arrives now is the
   document, not a note about it: the lines, the totals, the GST position and
   both ways to pay, so a client who never opens the link still knows what they
   owe and by when.

   It is a summary, not a replacement for the invoice. The tax invoice is the
   page and the PDF behind the button — this is the covering letter, and it says
   so by making the button the loudest thing in it.
--------------------------------------------------------------------------- */

export type InvoiceEmailLine = {
  label: string;
  /** "1 Mar 2026 – 28 Feb 2027", or null on a line that covers no period. */
  period: string | null;
  amountCents: number;
};

export function invoiceEmail(input: {
  clientName: string;
  number: string;
  /** A void invoice is never emailed, and a draft has no live link to email. */
  status: "sent" | "paid";
  dueDate: Date | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  taxRateBps: number;
  taxMode: "none" | "inclusive" | "exclusive";
  poNumber: string | null;
  lines: InvoiceEmailLine[];
  /** The client's own copy — the token IS the credential, so never a login. */
  payUrl: string;
  /** Whether card checkout is offered on that page, which decides the CTA. */
  payable: boolean;
  bankDetails: {
    bankName: string | null;
    bsb: string | null;
    accountName: string | null;
    accountNumber: string | null;
  };
}): Email {
  const money = (cents: number) => formatMoney(cents, input.currency);

  const balanceCents = Math.max(0, input.totalCents - input.amountPaidCents);
  const settled = input.status === "paid" || balanceCents === 0;
  const partPaid = !settled && input.amountPaidCents > 0;
  const due = input.dueDate ? formatDay(input.dueDate) : null;
  // Compared as days, not instants: an invoice due today is due today until
  // midnight, and telling someone they are late on the morning of is wrong.
  const overdue = Boolean(
    !settled && input.dueDate && startOfDay(input.dueDate) < startOfDay(new Date()),
  );

  /* The totals, exactly as InvoiceDocument states them — which rows appear is a
     function of the tax mode snapshotted at issue, and nothing else. */
  const totals: Array<{ label: string; value: string; strong?: boolean }> =
    input.taxMode === "none"
      ? [{ label: "Total", value: money(input.totalCents), strong: true }]
      : input.taxMode === "inclusive"
        ? [
            { label: "Subtotal", value: money(input.subtotalCents) },
            {
              label: `Includes GST (${formatTaxRate(input.taxRateBps)})`,
              value: money(input.taxCents),
            },
            {
              label: "Total (GST inclusive)",
              value: money(input.totalCents),
              strong: true,
            },
          ]
        : [
            { label: "Subtotal", value: money(input.subtotalCents) },
            {
              label: `GST (${formatTaxRate(input.taxRateBps)})`,
              value: money(input.taxCents),
            },
            { label: "Total", value: money(input.totalCents), strong: true },
          ];

  if (input.amountPaidCents > 0) {
    totals.push({ label: "Amount paid", value: `− ${money(input.amountPaidCents)}` });
    totals.push({
      label: settled ? "Balance" : "Balance due",
      value: money(balanceCents),
      strong: true,
    });
  }

  const bank = [
    ["Bank", input.bankDetails.bankName],
    ["Account name", input.bankDetails.accountName],
    ["BSB", input.bankDetails.bsb],
    ["Account number", input.bankDetails.accountNumber],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  const headline = settled
    ? `Invoice ${input.number} — paid`
    : overdue
      ? `Invoice ${input.number} — ${money(balanceCents)}, overdue`
      : `Invoice ${input.number} from KPVE — ${money(balanceCents)}${due ? `, due ${due}` : ""}`;

  /* ---- The amount line, said the same way in both parts. ---- */
  const amountLabel = settled
    ? "Paid in full"
    : partPaid
      ? "Balance still owing"
      : "Amount due";

  // What the big number is. On a settled invoice the balance is zero, and a
  // receipt whose headline figure is "$0" tells the reader nothing about what
  // they paid — so the total takes the slot once there is nothing owing.
  const heroCents = settled ? input.totalCents : balanceCents;

  const timing = settled
    ? "Nothing further to do — this copy is for your records."
    : overdue && due
      ? `This was due on ${due}.`
      : due
        ? `Due ${due}.`
        : "Payable on receipt.";

  /* ------------------------------------------------------------------ text */

  const text = [
    `Hi ${input.clientName},`,
    "",
    settled
      ? `Here's invoice ${input.number}, paid in full. Nothing further to do — this copy is for your records.`
      : `Here's invoice ${input.number} for ${money(balanceCents)}. ${timing}`,
    "",
    `${amountLabel.toUpperCase()}: ${money(heroCents)}`,
    ...(input.poNumber ? [`PO number: ${input.poNumber}`] : []),
    "",
    "WHAT'S ON IT",
    ...input.lines.map((line) =>
      [
        `  ${line.label}${line.period ? ` (${line.period})` : ""}`,
        `    ${money(line.amountCents)}`,
      ].join("\n"),
    ),
    "",
    ...totals.map((row) => `  ${row.label}: ${row.value}`),
    "",
    settled ? "YOUR COPY" : "TO PAY IT",
    `  ${input.payUrl}`,
    ...(settled
      ? ["  View it or download the PDF for your records."]
      : input.payable
        ? [
            "  Open it and press Pay now for a secure card checkout. If you've",
            "  already part-paid it, you're only charged the balance.",
          ]
        : ["  View it or download the PDF."]),
    ...(bank.length && !settled
      ? [
          "",
          "OR BY BANK TRANSFER",
          ...bank.map(([label, value]) => `  ${label}: ${value}`),
          `  Reference: ${input.number}`,
        ]
      : []),
    "",
    "If anything on it looks wrong, reply to this email and we'll sort it out.",
    "",
    "KPVE",
    appUrl(),
  ].join("\n");

  /* ------------------------------------------------------------------ html */

  const html = shell(
    settled
      ? `Invoice ${input.number} — paid in full.`
      : `${money(balanceCents)}${due ? `, due ${due}` : ""}.`,
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:23px;line-height:1.25;font-weight:700;color:${WHITE};">
       ${settled ? "Your invoice, paid" : `Invoice ${escapeHtml(input.number)}`}
     </h1>

     <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${MUTED_3};">Hi ${escapeHtml(input.clientName)},</p>

     <!-- The number the reader is here for, on its own surface. -->
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border:1px solid ${LINE_3};border-radius:11px;margin:0 0 24px;">
       <tr><td style="padding:20px 22px;">
         <p style="margin:0 0 6px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">${escapeHtml(amountLabel)} &middot; Invoice ${escapeHtml(input.number)}</p>
         <p style="margin:0 0 4px;font-family:${MONO};font-size:28px;font-weight:700;color:${GOLD_CREAM};">${escapeHtml(money(heroCents))}</p>
         <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${overdue ? GOLD_BRIGHT : MUTED_3};">${escapeHtml(timing)}</p>
         ${
           partPaid
             ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(`${money(input.amountPaidCents)} of ${money(input.totalCents)} already paid.`)}</p>`
             : ""
         }
         ${
           input.poNumber
             ? `<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">PO number ${escapeHtml(input.poNumber)}</p>`
             : ""
         }
       </td></tr>
     </table>

     ${button(input.payUrl, settled ? "View or download the invoice" : input.payable ? "View and pay the invoice" : "View the invoice")}

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
       <tr><td height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
     </table>

     <p style="margin:0 0 14px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${GOLD};">What's on it</p>

     <!-- The lines. Two columns, right-aligned money, because a column of
          amounts that does not line up reads as a mistake in the amounts. -->
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">
       ${input.lines
         .map(
           (line) => `<tr>
         <td valign="top" style="padding:0 12px 12px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${WHITE};">
           ${escapeHtml(line.label)}
           ${
             line.period
               ? `<span style="display:block;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(line.period)}</span>`
               : ""
           }
         </td>
         <td valign="top" align="right" nowrap="nowrap" style="padding:0 0 12px;font-family:${MONO};font-size:14px;line-height:1.5;color:${MUTED_3};white-space:nowrap;">${escapeHtml(money(line.amountCents))}</td>
       </tr>`,
         )
         .join("")}
       <tr><td colspan="2" height="1" bgcolor="${LINE}" style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</td></tr>
       ${totals
         .map(
           (row, i) => `<tr>
         <td align="right" style="padding:${i === 0 ? "12px" : "0"} 12px 8px 0;font-family:${SANS};font-size:${row.strong ? "14px" : "13px"};font-weight:${row.strong ? "700" : "400"};color:${row.strong ? WHITE : MUTED};">${escapeHtml(row.label)}</td>
         <td align="right" nowrap="nowrap" style="padding:${i === 0 ? "12px" : "0"} 0 8px;font-family:${MONO};font-size:${row.strong ? "15px" : "13px"};font-weight:${row.strong ? "700" : "400"};color:${row.strong ? GOLD_CREAM : MUTED};white-space:nowrap;">${escapeHtml(row.value)}</td>
       </tr>`,
         )
         .join("")}
     </table>

     ${
       settled
         ? ""
         : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SURFACE_2}" style="background:${SURFACE_2};border-left:2px solid ${GOLD};border-radius:0 8px 8px 0;margin:20px 0 0;">
       <tr><td style="padding:16px 18px;">
         <p style="margin:0 0 4px;font-family:${SANS};font-size:14px;font-weight:700;color:${WHITE};">How to pay</p>
         <p style="margin:0${bank.length ? " 0 12px" : ""};font-family:${SANS};font-size:14px;line-height:1.55;color:${MUTED_3};">
           ${
             input.payable
               ? `<a href="${input.payUrl}" style="color:${GOLD_BRIGHT};text-decoration:underline;">Open the invoice</a> and press <strong style="color:${WHITE};font-weight:600;">Pay now</strong> for a secure card checkout${partPaid ? " — you're only charged the balance" : ""}.`
               : `<a href="${input.payUrl}" style="color:${GOLD_BRIGHT};text-decoration:underline;">Open the invoice</a> for the full details and a PDF for your records.`
           }
         </p>
         ${
           bank.length
             ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
           ${[...bank, ["Reference", input.number] as [string, string]]
             .map(
               ([label, value]) => `<tr>
             <td valign="top" style="padding:0 14px 4px 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(label)}</td>
             <td valign="top" style="padding:0 0 4px;font-family:${MONO};font-size:13px;line-height:1.5;color:${MUTED_3};">${escapeHtml(value)}</td>
           </tr>`,
             )
             .join("")}
         </table>`
             : ""
         }
       </td></tr>
     </table>`
     }

     <p style="margin:24px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${MUTED};">
       If anything on it looks wrong, reply to this email and we'll sort it out.
     </p>`,
  );

  return { subject: headline, text, html };
}

/** Midnight local — see the `overdue` comparison above. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
