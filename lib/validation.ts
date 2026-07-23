import { z } from "zod";

import { CURRENCIES, parseAmountToCents } from "@/lib/billing";

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
 * Creating a client asks for identity and nothing else. Money is not a field
 * here on purpose — a client has many billable services, so they are attached
 * afterwards on the client's own page (see createClientServiceSchema).
 */
export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  company: emptyToUndefined.pipe(z.string().max(200).optional()),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(255, "Email is too long")
    .email("Enter a valid email address")
    .transform(normalizeEmail),
  phone: emptyToUndefined.pipe(z.string().max(50).optional()),
  assignedStaffId: optionalStaffId,
  notes: z.string().max(10000).optional(),
});

export const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  company: emptyToUndefined.pipe(z.string().max(200).optional()),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Enter a valid email address")
    .transform(normalizeEmail)
    .optional(),
  phone: emptyToUndefined.pipe(z.string().max(50).optional()),
  category: serviceCategorySchema.optional(),
  status: clientStatusSchema.optional(),
  assignedStaffId: optionalStaffId,
  notes: z.string().max(10000).optional(),
});

export const clientFiltersSchema = z.object({
  status: clientStatusSchema.optional(),
  category: serviceCategorySchema.optional(),
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

export const currencySchema = z.enum(CURRENCIES).default("AUD");

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
});

export const updateServiceSchema = createServiceSchema.extend({
  serviceId: z.string().uuid(),
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
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
  amount: amountToCents,
  currency: currencySchema,
  interval: billingIntervalSchema,
  status: clientServiceStatusSchema.default("active"),
  startedAt: optionalDate,
  notes: emptyToUndefined.pipe(z.string().max(2000).optional()),
});

export const updateClientServiceSchema = z.object({
  clientServiceId: z.string().uuid(),
  label: z.string().trim().min(1, "Give this line a name").max(200).optional(),
  amount: amountToCents.optional(),
  currency: currencySchema.optional(),
  interval: billingIntervalSchema.optional(),
  status: clientServiceStatusSchema.optional(),
  startedAt: optionalDate,
  nextBillAt: optionalDate,
  notes: emptyToUndefined.pipe(z.string().max(2000).optional()),
});
