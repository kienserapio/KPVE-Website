import { z } from "zod";

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

export const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  status: leadStatusSchema.optional(),
  internalNotes: z.string().max(10000).optional(),
  assignedStaffId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const leadFiltersSchema = z.object({
  status: leadStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
