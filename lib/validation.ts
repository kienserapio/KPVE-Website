import { z } from "zod";

import { CURRENCIES, MAX_QUANTITY, parseAmountToCents } from "@/lib/billing";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Public contact form. This runs on untrusted input from an unauthenticated
 * endpoint, so every bound is explicit — an unbounded text field is a free
 * database-filling primitive for anyone with curl.
 */
export const contactFormSchema = z.object({
  firstName: z
    .string({ error: "First name is required" })
    .trim()
    .min(1, "First name is required")
    .max(100, "First name is too long"),
  lastName: z
    .string({ error: "Last name is required" })
    .trim()
    .min(1, "Last name is required")
    .max(100, "Last name is too long"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .min(1, "Email is required")
    .max(255, "Email is too long")
    .email("Enter a valid email address")
    .transform(normalizeEmail),
  phone: z
    .string()
    .trim()
    .max(50, "Phone number is too long")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  message: z
    .string({ error: "Please include a message" })
    .trim()
    .min(10, "Please tell us a little more (at least 10 characters)")
    .max(5000, "Message is too long (5000 characters max)"),
  source: z.string().trim().max(255).default("/"),
  /**
   * Honeypot. Accepted by the schema on purpose — the handler checks it and
   * returns a normal success. Failing validation here would tell a bot exactly
   * which field caught it, which is the one thing a honeypot must not do.
   */
  website: z.string().max(500).optional(),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(255).transform(normalizeEmail),
  password: z.string().min(1, "Password is required").max(200),
});

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
]);

export const serviceCategorySchema = z.enum([
  "general",
  "design",
  "web_development",
  "hosting",
  "support",
  "business",
  "media",
  "social_media",
]);

export const prioritySchema = z.enum(["low", "medium", "high"]);

export const clientStatusSchema = z.enum([
  "prospect",
  "active",
  "on_hold",
  "completed",
  "churned",
]);

export const clientTypeSchema = z.enum(["individual", "company"]);

/** "" (unassigned select) → null; a real UUID → that UUID. */
const optionalStaffId = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  status: leadStatusSchema.optional(),
  category: serviceCategorySchema.optional(),
  priority: prioritySchema.optional(),
  internalNotes: z.string().max(10000).optional(),
  assignedStaffId: optionalStaffId,
});

export const leadFiltersSchema = z.object({
  status: leadStatusSchema.optional(),
  category: serviceCategorySchema.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/* ---------------------------------------------------------------------------
   Clients
--------------------------------------------------------------------------- */

// "" → undefined so an empty optional field clears rather than storing "".
const emptyToUndefined = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * A checkbox is either "on" or missing entirely — HTML never posts "off". The
 * literals cover the round-trip case where a value we rendered comes back.
 */
const checkboxToBoolean = z
  .union([
    z.literal("on"),
    z.literal("true"),
    z.literal("false"),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => v === "on" || v === "true");

/**
 * Optional email: "" clears it, anything else has to be a real address. The ""
 * branch is a separate arm rather than a pipe through emptyToUndefined because
 * an empty string is not a valid email and would fail before it ever got the
 * chance to mean "blank".
 */
const optionalEmail = z
  .string()
  .trim()
  .max(255, "Email is too long")
  .email("Enter a valid email address")
  .transform(normalizeEmail)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Australian ABNs are written "12 345 678 901" and typed that way too. Store
 * the digits — the spacing is a display decision, and two records for the same
 * business that differ only by whitespace is the bug this prevents.
 */
const optionalAbn = emptyToUndefined
  .transform((value) => (value ? value.replace(/\s+/g, "") : value))
  .pipe(z.string().max(20, "That ABN doesn't look right").optional());

/**
 * "" (nothing picked) → null; a real UUID → that UUID. Same shape as
 * optionalStaffId — a picker that can be cleared has to be able to send the
 * clearing, and "" is what a <select> sends when you pick the blank option.
 */
const optionalClientId = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * Creating a client asks for identity and nothing else. Money is not a field
 * here on purpose — a client has many billable services, so they are attached
 * afterwards on the client's own page (see createClientServiceSchema).
 */
export const createClientSchema = z.object({
  /**
   * Person or business. On a company, `name` is the trading name and
   * `contactName` is the human; on an individual, `name` is the person and
   * `contactName` is blank. Defaults to individual, which is what a converted
   * lead always is — a contact form is filled in by a person.
   */
  clientType: clientTypeSchema.optional().default("individual"),
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  contactName: emptyToUndefined.pipe(z.string().max(200, "Name is too long").optional()),
  company: emptyToUndefined.pipe(z.string().max(200).optional()),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(255, "Email is too long")
    .email("Enter a valid email address")
    .transform(normalizeEmail),
  phone: emptyToUndefined.pipe(z.string().max(50).optional()),
  /** The individual who owns this company. One level only — see the DAL. */
  parentClientId: optionalClientId,
  assignedStaffId: optionalStaffId,
  notes: z.string().max(10000).optional(),

  /* ---- Billing profile: who they are to the tax office ---- */
  billingName: emptyToUndefined.pipe(z.string().max(200, "Name is too long").optional()),
  billingAbn: optionalAbn,
  billingEmail: optionalEmail,
  billingAddress: emptyToUndefined.pipe(
    z.string().max(1000, "That address is too long").optional(),
  ),
});

export const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  // Editable, not just a create-time choice: a client entered as an individual
  // that turns out to be a company is a one-field fix, not a re-entry.
  clientType: clientTypeSchema.optional(),
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  contactName: emptyToUndefined.pipe(z.string().max(200, "Name is too long").optional()),
  company: emptyToUndefined.pipe(z.string().max(200).optional()),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Enter a valid email address")
    .transform(normalizeEmail)
    .optional(),
  phone: emptyToUndefined.pipe(z.string().max(50).optional()),
  parentClientId: optionalClientId,
  category: serviceCategorySchema.optional(),
  status: clientStatusSchema.optional(),
  assignedStaffId: optionalStaffId,
  notes: z.string().max(10000).optional(),

  /* ---- Billing profile ---- */
  billingName: emptyToUndefined.pipe(z.string().max(200, "Name is too long").optional()),
  billingAbn: optionalAbn,
  billingEmail: optionalEmail,
  billingAddress: emptyToUndefined.pipe(
    z.string().max(1000, "That address is too long").optional(),
  ),
});

export const clientFiltersSchema = z.object({
  status: clientStatusSchema.optional(),
  category: serviceCategorySchema.optional(),
  type: clientTypeSchema.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const createTaskSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1, "Task can't be empty").max(500, "Task is too long"),
  // datetime-local sends "YYYY-MM-DDTHH:mm" with no zone; "" means no due date.
  dueAt: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
});

/* ---------------------------------------------------------------------------
   Services (the billable catalogue) and client services (what a client is on)
--------------------------------------------------------------------------- */

export const billingIntervalSchema = z.enum([
  "one_off",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
]);

export const clientServiceStatusSchema = z.enum([
  "draft",
  "pending_payment",
  "active",
  "paused",
  "cancelled",
]);

/** The bare choices. The exported schemas below decide about defaulting. */
const currencyValue = z.enum(CURRENCIES);

export const currencySchema = currencyValue.default("AUD");

/**
 * The same choices WITHOUT the default, for partial updates.
 *
 * In Zod v4 `.optional()` does not suppress an inner `.default()`:
 * `currencySchema.optional()` parses `{}` back as `{ currency: "AUD" }`. A
 * status-only save (see setClientServiceStatusAction) would then carry an AUD
 * it was never given and stamp it over a USD line. Same trap `optionalQuantity`
 * exists for, and the same fix.
 *
 * `billingIntervalSchema` and `clientServiceStatusSchema` need no twin: both
 * are plain enums with no inner default — the "active" default is applied
 * per-field on the create schema, not on the exported enum — so their
 * `.optional()` really does mean "say nothing".
 */
const optionalCurrency = currencyValue.optional();

/**
 * Money arrives as whatever the person typed — "$11", "11.00", "1,100". Parse
 * it to integer cents here so nothing downstream ever sees a float or a string.
 */
const amountToCents = z
  .string({ error: "Amount is required" })
  .trim()
  .transform((raw, ctx) => {
    const cents = parseAmountToCents(raw);
    if (cents === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter an amount like 11 or 11.50",
      });
      return z.NEVER;
    }
    return cents;
  });

/**
 * How many of the thing. Never zero — a line worth nothing is not what anyone
 * typed — and bounded so a slipped keystroke can't multiply into an amount the
 * integer column won't hold.
 */
const quantityValue = z.coerce
  .number()
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(MAX_QUANTITY, `Quantity can't be more than ${MAX_QUANTITY}`);

export const quantitySchema = quantityValue.default(1);

/**
 * The same bounds without the default. A partial update has to be able to say
 * nothing about quantity: `quantitySchema.optional()` would still fill in 1,
 * and a status-only save would quietly re-price a client's four mailboxes down
 * to one.
 */
const optionalQuantity = z
  .union([z.literal(""), z.null(), z.undefined()])
  .transform(() => undefined)
  .or(quantityValue)
  .optional();

/**
 * "" → undefined; "YYYY-MM-DD" (a date input) → local midnight on that day.
 * The explicit time matters: `new Date("2026-07-23")` is parsed as UTC, which
 * lands on the 22nd for anyone west of Greenwich.
 */
const optionalDate = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined))
  .transform((raw, ctx) => {
    if (!raw) return undefined;
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: "custom", message: "That date isn't valid" });
      return z.NEVER;
    }
    return parsed;
  });

export const createServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the service a name")
    .max(120, "Name is too long"),
  description: emptyToUndefined.pipe(z.string().max(1000).optional()),
  defaultAmount: amountToCents,
  defaultCurrency: currencySchema,
  defaultInterval: billingIntervalSchema.default("monthly"),
  /** What one unit is: "mailbox", "seat", "page". Blank for uncounted things. */
  unitLabel: emptyToUndefined.pipe(z.string().max(40, "Keep the unit short").optional()),
});

export const updateServiceSchema = createServiceSchema.extend({
  serviceId: z.string().uuid(),
  isActive: checkboxToBoolean,
});

export const createClientServiceSchema = z.object({
  clientId: z.string().uuid(),
  // "" = a bespoke line with no catalogue entry behind it.
  serviceId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  label: z.string().trim().min(1, "Give this line a name").max(200, "Name is too long"),
  /**
   * The price of ONE. There is deliberately no `amount` here: the line total is
   * unit × quantity, computed on the DAL write path, and a total nobody can
   * type is a total nobody can typo.
   */
  unitAmount: amountToCents,
  quantity: quantitySchema,
  currency: currencySchema,
  interval: billingIntervalSchema,
  status: clientServiceStatusSchema.default("active"),
  startedAt: optionalDate,
  notes: emptyToUndefined.pipe(z.string().max(2000).optional()),
});

/* ---------------------------------------------------------------------------
   Payments, notes, documents and checklists
--------------------------------------------------------------------------- */

export const clientServiceIdSchema = z.object({
  clientServiceId: z.string().uuid(),
});

export const noteKindSchema = z.enum(["note", "call", "meeting", "email", "milestone"]);

export const createNoteSchema = z.object({
  clientId: z.string().uuid(),
  kind: noteKindSchema.default("note"),
  body: z
    .string()
    .trim()
    .min(1, "Write something first")
    .max(5000, "That's too long for one entry"),
  // datetime-local, blank means "now".
  occurredAt: optionalDate,
});

export const documentKindSchema = z.enum([
  "contract",
  "proposal",
  "brief",
  "invoice",
  "asset",
  "other",
]);

export const createDocumentSchema = z.object({
  clientId: z.string().uuid(),
  label: z.string().trim().min(1, "Give the document a name").max(200, "Name is too long"),
  /**
   * http/https only. A `javascript:` or `data:` URL stored here would be
   * rendered as a link on the client page and clicked by staff — this is the
   * one place untrusted-looking input becomes something someone clicks.
   */
  url: z
    .string()
    .trim()
    .min(1, "Paste a link")
    .max(2000, "That link is too long")
    .refine(
      (value) => {
        try {
          const { protocol } = new URL(value);
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Enter a full link starting with https://" },
    ),
  kind: documentKindSchema.default("other"),
});

export const createTaskTemplateSchema = z.object({
  serviceId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the step a name").max(300, "That's too long"),
  // Days after the service starts. A year of lead time is plenty; negative
  // would mean "due before we sold it".
  offsetDays: z.coerce.number().int().min(0, "Days can't be negative").max(365).default(0),
});

export const updateClientServiceSchema = z.object({
  clientServiceId: z.string().uuid(),
  label: z.string().trim().min(1, "Give this line a name").max(200).optional(),
  /** The price of ONE — see createClientServiceSchema. */
  unitAmount: amountToCents.optional(),
  /** Optional here, unlike on create — see optionalQuantity. */
  quantity: optionalQuantity,
  /** Non-defaulting on purpose — see optionalCurrency. */
  currency: optionalCurrency,
  interval: billingIntervalSchema.optional(),
  status: clientServiceStatusSchema.optional(),
  startedAt: optionalDate,
  nextBillAt: optionalDate,
  notes: emptyToUndefined.pipe(z.string().max(2000).optional()),
});

/**
 * One provisioned thing under a billing line — a mailbox address, a domain, a
 * deliverable. Added and removed one at a time over the life of the account.
 */
export const createServiceItemSchema = z.object({
  clientServiceId: z.string().uuid(),
  label: z
    .string()
    .trim()
    .min(1, "Give it a name")
    .max(200, "That's too long for one item"),
});

/* ---------------------------------------------------------------------------
   Org settings — KPVE's own details, edited at /admin/settings
--------------------------------------------------------------------------- */

/**
 * Staff type a percentage; the column stores basis points. "10" → 1000,
 * "10.5" → 1050. Basis points because a float rate rounds money, and 10.5%
 * of $11 has to be the same number every time it is computed.
 */
const percentToBps = z
  .union([z.string(), z.number()])
  .optional()
  .transform((raw, ctx) => {
    // Blank means "the usual" rather than "no tax" — the rate only matters at
    // all once GST registration is switched on, and 10% is the only Australian
    // answer. Matches the column default.
    if (raw === undefined || raw === "") return 1000;

    const percent = typeof raw === "number" ? raw : Number(String(raw).trim().replace("%", ""));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      ctx.addIssue({ code: "custom", message: "Enter a tax rate like 10 or 10.5" });
      return z.NEVER;
    }
    return Math.round(percent * 100);
  });

export const orgSettingsSchema = z.object({
  /* ---- Identity ---- */
  legalName: z
    .string()
    .trim()
    .min(1, "Legal name is required")
    .max(200, "Name is too long"),
  tradingName: emptyToUndefined.pipe(z.string().max(200, "Name is too long").optional()),
  abn: optionalAbn,
  address: emptyToUndefined.pipe(z.string().max(1000, "Address is too long").optional()),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(255, "Email is too long")
    .email("Enter a valid email address")
    .transform(normalizeEmail),
  phone: emptyToUndefined.pipe(z.string().max(50).optional()),
  website: emptyToUndefined.pipe(z.string().max(255, "That link is too long").optional()),

  /* ---- Tax ---- */
  gstRegistered: checkboxToBoolean,
  taxRateBps: percentToBps,
  pricesIncludeTax: checkboxToBoolean,

  /* ---- Invoicing ---- */
  // Goes into the invoice number ("INV-2026-0001"), so nothing that would need
  // escaping or that reads as a separator.
  invoicePrefix: z
    .string()
    .trim()
    .min(1, "Give invoices a prefix")
    .max(10, "Keep the prefix short")
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
  // 0 = due on receipt; half a year of terms is already generous. A blank box
  // means "the usual", not "pay immediately" — z.coerce would turn "" into 0.
  paymentTermsDays: z
    .literal("")
    .transform(() => 14)
    .or(
      z.coerce
        .number()
        .int()
        .min(0, "Terms can't be negative")
        .max(180, "That's an unusually long term")
        .default(14),
    ),
  invoiceFooter: emptyToUndefined.pipe(z.string().max(2000, "That's too long").optional()),
  bankName: emptyToUndefined.pipe(z.string().max(120).optional()),
  bsb: emptyToUndefined.pipe(z.string().max(20).optional()),
  accountName: emptyToUndefined.pipe(z.string().max(200).optional()),
  accountNumber: emptyToUndefined.pipe(z.string().max(40).optional()),
});

/* ---------------------------------------------------------------------------
   Invoices
--------------------------------------------------------------------------- */

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);

/**
 * Which billing lines go on the invoice. FormData sends one repeated field per
 * checked line, so what arrives is a single string when one is ticked and an
 * array when several are — normalize both to an array before validating, or
 * invoicing exactly one line fails in a way nobody can read.
 */
const clientServiceIds = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .pipe(z.array(z.string().uuid()).min(1, "Pick at least one line to invoice"));

export const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  clientServiceIds,
  // Blank = today / today + the org's payment terms. Filled in by the builder.
  issueDate: optionalDate,
  dueDate: optionalDate,
  poNumber: emptyToUndefined.pipe(z.string().max(60, "That's too long").optional()),
  notes: emptyToUndefined.pipe(z.string().max(2000, "That's too long").optional()),
});

/** Draft-only edits. A sent invoice is void-and-reissue, never a correction. */
export const updateInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  notes: emptyToUndefined.pipe(z.string().max(2000, "That's too long").optional()),
  poNumber: emptyToUndefined.pipe(z.string().max(60, "That's too long").optional()),
  issueDate: optionalDate,
  dueDate: optionalDate,
});

export const setInvoiceStatusSchema = z.object({
  invoiceId: z.string().uuid(),
  status: invoiceStatusSchema,
});
