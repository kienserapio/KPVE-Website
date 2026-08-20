import "server-only";

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { clientAutopay, clients, invoices, orgSettings } from "@/lib/db/schema";
import { appUrl, getPaymentProvider } from "@/lib/payments";
import { AUTOPAY_CONSENT_TEXT } from "@/lib/autopay/consent";
import { requirePortalSession } from "./portal-session";
import { requireSession } from "./session";
import { getOrgSettings } from "./settings";
import { logActivity } from "./activity";

/* ---------------------------------------------------------------------------
   AutoPay, from the two places a human looks at it: the client's portal and the
   CRM. Everything here starts with a session.

   The no-session half — the nightly job and the webhook — is in
   lib/dal/autopay-run.ts.

   One rule runs through all of it: turning AutoPay ON can only ever happen from
   the client's side, because it is their consent to record. Staff can turn it
   OFF (a client rings up and asks), and that is the only direction the CRM is
   allowed to move it.
--------------------------------------------------------------------------- */

/** How close to expiry the portal starts warning. Cards die quietly otherwise. */
const EXPIRY_WARNING_DAYS = 30;

export type AutopayCard = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  /** Already past the end of its expiry month. */
  expired: boolean;
  /** Expires within the month — worth saying before a charge fails. */
  expiringSoon: boolean;
};

export type AutopayNextCharge = {
  invoiceId: string;
  number: string;
  dueDate: Date | null;
  amountCents: number;
  currency: string;
  /** True once the due date has passed — the next run will take it. */
  due: boolean;
};

export type PortalAutopayView = {
  enabled: boolean;
  /** True while payments are simulated, so the portal can say so. */
  simulated: boolean;
  card: AutopayCard | null;
  consentAt: Date | null;
  lastChargeAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  /** The card has failed enough times that the run has stopped trying it. */
  needsAttention: boolean;
  next: AutopayNextCharge | null;
};

export async function getPortalAutopay(): Promise<PortalAutopayView> {
  const session = await requirePortalSession();
  const now = new Date();

  const [row] = await db
    .select()
    .from(clientAutopay)
    .where(eq(clientAutopay.clientId, session.clientId))
    .limit(1);

  const next = await nextChargeableInvoice(session.clientId, now);

  if (!row) {
    return {
      enabled: false,
      simulated: getPaymentProvider().simulated,
      card: null,
      consentAt: null,
      lastChargeAt: null,
      lastFailureAt: null,
      lastFailureCode: null,
      needsAttention: false,
      next,
    };
  }

  return {
    enabled: row.enabled,
    simulated: getPaymentProvider().simulated,
    card: row.paymentMethodId ? describeCard(row, now) : null,
    consentAt: row.consentAt,
    lastChargeAt: row.lastChargeAt,
    lastFailureAt: row.lastFailureAt,
    lastFailureCode: row.lastFailureCode,
    needsAttention: row.consecutiveFailures > 0,
    next,
  };
}

/**
 * Start the "save my card" flow, and record the consent that goes with it.
 *
 * The consent is written NOW, at the moment the client read the terms and
 * pressed the button — not when the card lands. Those are different events, the
 * second one happens on Stripe's page, and the record has to describe the first.
 *
 * AutoPay is deliberately NOT enabled here. It switches on when a card actually
 * arrives (see completeAutopaySetup), because an arrangement with nothing
 * behind it would show the client a promise this app cannot keep.
 */
export async function startPortalAutopaySetup(input: {
  ip: string;
  userAgent: string | null;
}): Promise<{ url: string }> {
  const session = await requirePortalSession();

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      billingEmail: clients.billingEmail,
      customerId: clients.billingCustomerId,
    })
    .from(clients)
    .where(eq(clients.id, session.clientId))
    .limit(1);
  if (!client) throw new Error("NOT_FOUND");

  const provider = getPaymentProvider();
  const setup = await provider.createSetupSession({
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.billingEmail || client.email,
    customerId: client.customerId,
    successUrl: `${appUrl()}/portal/autopay?saved=1`,
    cancelUrl: `${appUrl()}/portal/autopay?cancelled=1`,
  });

  const consent = {
    consentText: AUTOPAY_CONSENT_TEXT,
    consentIp: input.ip,
    consentUserAgent: input.userAgent?.slice(0, 500) ?? null,
    consentBy: session.clientUserId,
  };

  /**
   * The first time they agreed, kept.
   *
   * Swapping a card runs this same path, and overwriting the timestamp each
   * time would erase the date of the original authorisation — which is the one
   * fact the whole consent record exists to preserve. The words are versioned
   * and unchanged, so re-agreeing to the same terms is not a new agreement.
   */
  const consentAt = sql`coalesce(${clientAutopay.consentAt}, now())`;

  await db
    .insert(clientAutopay)
    .values({
      clientId: client.id,
      provider: provider.name,
      setupRef: setup.ref,
      setupUrl: setup.url,
      setupCreatedAt: sql`now()`,
      consentAt: sql`now()`,
      ...consent,
    })
    .onConflictDoUpdate({
      target: clientAutopay.clientId,
      set: {
        provider: provider.name,
        setupRef: setup.ref,
        setupUrl: setup.url,
        setupCreatedAt: sql`now()`,
        updatedAt: sql`now()`,
        consentAt,
        ...consent,
      },
    });

  // A client can reach a setup before they have ever paid, so this may be the
  // first customer id we have had for them.
  if (setup.customerId && setup.customerId !== client.customerId) {
    await db
      .update(clients)
      .set({ billingCustomerId: setup.customerId, updatedAt: sql`now()` })
      .where(eq(clients.id, client.id));
  }

  await logActivity({
    actorType: "client",
    actorId: session.clientUserId,
    entityType: "client",
    entityId: client.id,
    action: "autopay.setup_started",
  });

  return { url: setup.url };
}

/**
 * The off switch, from the client's side.
 *
 * Immediate, unconditional, and never asks staff — that is both what the card
 * networks require of a stored-credential arrangement and the single best thing
 * a business can do about disputes. The card itself is kept: turning AutoPay
 * back on next month should not mean typing it again.
 */
export async function disablePortalAutopay(): Promise<void> {
  const session = await requirePortalSession();

  const [row] = await db
    .update(clientAutopay)
    .set({ enabled: false, disabledAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(clientAutopay.clientId, session.clientId))
    .returning({ clientId: clientAutopay.clientId });

  if (!row) return;

  await logActivity({
    actorType: "client",
    actorId: session.clientUserId,
    entityType: "client",
    entityId: session.clientId,
    action: "autopay.disabled",
    metadata: { by: "client" },
  });
}

/* ---------------------------------------------------------------------------
   Staff side
--------------------------------------------------------------------------- */

export type StaffAutopayView = {
  enabled: boolean;
  card: AutopayCard | null;
  consentAt: Date | null;
  consentText: string | null;
  lastChargeAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  consecutiveFailures: number;
  /** Null when this client has never opened the flow. */
  exists: boolean;
};

export async function getClientAutopay(clientId: string): Promise<StaffAutopayView> {
  await requireSession();
  const now = new Date();

  const [row] = await db
    .select()
    .from(clientAutopay)
    .where(eq(clientAutopay.clientId, clientId))
    .limit(1);

  if (!row) {
    return {
      enabled: false,
      card: null,
      consentAt: null,
      consentText: null,
      lastChargeAt: null,
      lastFailureAt: null,
      lastFailureCode: null,
      consecutiveFailures: 0,
      exists: false,
    };
  }

  return {
    enabled: row.enabled,
    card: row.paymentMethodId ? describeCard(row, now) : null,
    consentAt: row.consentAt,
    consentText: row.consentText,
    lastChargeAt: row.lastChargeAt,
    lastFailureAt: row.lastFailureAt,
    lastFailureCode: row.lastFailureCode,
    consecutiveFailures: row.consecutiveFailures,
    exists: true,
  };
}

/**
 * Staff turning AutoPay off for a client who asked them to.
 *
 * There is deliberately no matching "turn it on". Consent to store and charge a
 * card has to come from the person whose card it is; a CRM button that could
 * manufacture it would make the consent record worthless.
 */
export async function disableClientAutopay(clientId: string): Promise<{ clientId: string }> {
  const staff = await requireSession();

  const [row] = await db
    .update(clientAutopay)
    .set({ enabled: false, disabledAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(clientAutopay.clientId, clientId))
    .returning({ clientId: clientAutopay.clientId });

  if (!row) throw new Error("NOT_FOUND");

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "client",
    entityId: clientId,
    action: "autopay.disabled",
    metadata: { by: "staff" },
  });

  return { clientId };
}

/**
 * The master switch, and the ceilings the nightly run works under.
 *
 * Read straight off org_settings so /admin/settings can show what the run will
 * actually do rather than what the code's defaults say.
 */
export async function getAutopaySettings(): Promise<{
  enabled: boolean;
  maxInvoicesPerRun: number;
  maxCentsPerRun: number;
  maxInvoiceCents: number;
  noticeDays: number;
}> {
  await requireSession();
  const settings = await getOrgSettings();

  return {
    enabled: settings.autopayEnabled,
    maxInvoicesPerRun: settings.autopayMaxInvoicesPerRun,
    maxCentsPerRun: settings.autopayMaxCentsPerRun,
    maxInvoiceCents: settings.autopayMaxInvoiceCents,
    noticeDays: settings.autopayNoticeDays,
  };
}

/**
 * Stop, or start, every AutoPay run.
 *
 * In the database rather than the environment on purpose: the moment anyone
 * wants this off is the moment something looks wrong, and that is the worst
 * possible time to need a deploy. One click here and the next run does nothing.
 *
 * It does not touch any client's arrangement — their consent and their saved
 * card are untouched, so turning it back on resumes rather than re-asks.
 */
export async function setAutopayMasterSwitch(enabled: boolean): Promise<void> {
  const staff = await requireSession();
  const settings = await getOrgSettings();

  await db
    .update(orgSettings)
    .set({ autopayEnabled: enabled, updatedAt: new Date(), updatedBy: staff.id })
    .where(eq(orgSettings.id, settings.id));

  await logActivity({
    actorType: "staff",
    actorId: staff.id,
    entityType: "settings",
    entityId: settings.id,
    action: enabled ? "autopay.master_enabled" : "autopay.master_disabled",
  });
}

/* ---------------------------------------------------------------------------
   Shared helpers
--------------------------------------------------------------------------- */

/**
 * A card is good until the END of its expiry month — "05/2026" works all
 * through May. Getting that wrong shows a client a scary warning a month early
 * and, worse, would stop a run on a card that is perfectly fine.
 */
function describeCard(
  row: { cardBrand: string | null; cardLast4: string | null; cardExpMonth: number | null; cardExpYear: number | null },
  now: Date,
): AutopayCard {
  const base = {
    brand: row.cardBrand,
    last4: row.cardLast4,
    expMonth: row.cardExpMonth,
    expYear: row.cardExpYear,
  };

  if (!row.cardExpMonth || !row.cardExpYear) {
    return { ...base, expired: false, expiringSoon: false };
  }

  // Midnight on the 1st of the following month.
  const expiresAt = new Date(Date.UTC(row.cardExpYear, row.cardExpMonth, 1));
  const warnFrom = new Date(expiresAt);
  warnFrom.setUTCDate(warnFrom.getUTCDate() - EXPIRY_WARNING_DAYS);

  return {
    ...base,
    expired: now >= expiresAt,
    expiringSoon: now >= warnFrom && now < expiresAt,
  };
}

/** The invoice AutoPay will take next: soonest due, still owed. */
async function nextChargeableInvoice(
  clientId: string,
  now: Date,
): Promise<AutopayNextCharge | null> {
  const [row] = await db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      balanceCents: sql<number>`(${invoices.totalCents} - ${invoices.amountPaidCents})`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, clientId),
        eq(invoices.status, "sent"),
        isNotNull(invoices.dueDate),
        sql`${invoices.totalCents} - ${invoices.amountPaidCents} > 0`,
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(1);

  if (!row) return null;

  const dueDate = row.dueDate ? new Date(`${row.dueDate}T00:00:00.000Z`) : null;

  return {
    invoiceId: row.invoiceId,
    number: row.number,
    dueDate,
    amountCents: row.balanceCents,
    currency: row.currency,
    due: dueDate !== null && dueDate <= now,
  };
}
