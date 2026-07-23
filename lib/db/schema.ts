import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------------------
   Enums
--------------------------------------------------------------------------- */

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "converted",
  "archived",
]);

export const actorTypeEnum = pgEnum("actor_type", ["staff", "system"]);

/**
 * What the enquiry (or client engagement) is about. Mirrors the seven service
 * slugs in lib/data.ts, plus "general" as the default for anything a staff
 * member hasn't triaged yet. Labels live in components/admin/ui.tsx.
 */
export const serviceCategoryEnum = pgEnum("service_category", [
  "general",
  "design",
  "web_development",
  "hosting",
  "support",
  "business",
  "media",
  "social_media",
]);

/** Triage priority. A CRM staple — surfaces the enquiries worth chasing first. */
export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);

/**
 * Lifecycle of a client relationship, distinct from the lead pipeline. A lead
 * becomes a client once won; from there the relationship has its own states.
 */
export const clientStatusEnum = pgEnum("client_status", [
  "prospect",
  "active",
  "on_hold",
  "completed",
  "churned",
]);

/**
 * How often a service is charged. `one_off` is a single invoice, not a cycle —
 * it is deliberately part of the same enum so a project fee and a retainer can
 * live on the same client as two rows of the same shape. Revenue maths excludes
 * one-offs from MRR and reports them separately (see lib/billing.ts).
 */
export const billingIntervalEnum = pgEnum("billing_interval", [
  "one_off",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
]);

/**
 * Lifecycle of a single service sold to a client.
 * `pending_payment` exists for the Stripe step: the link has been sent, nothing
 * has cleared yet. Only `active` counts toward MRR.
 */
export const clientServiceStatusEnum = pgEnum("client_service_status", [
  "draft",
  "pending_payment",
  "active",
  "paused",
  "cancelled",
]);

/**
 * A single attempt to take money. `pending` is "link sent, nothing has cleared";
 * `succeeded` is the only state that counts as collected revenue.
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

/** What a timeline entry records. `note` is the catch-all. */
export const noteKindEnum = pgEnum("note_kind", [
  "note",
  "call",
  "meeting",
  "email",
  "milestone",
]);

export const documentKindEnum = pgEnum("document_kind", [
  "contract",
  "proposal",
  "brief",
  "invoice",
  "asset",
  "other",
]);

/* ---------------------------------------------------------------------------
   staff_users — everyone who can log into /admin.
   No public signup; seeded via scripts/create-staff-user.ts.
   No `role` column yet — there is a single entity type and nothing to
   permission. Adding one later is a nullable column with a default.
--------------------------------------------------------------------------- */

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Always stored lowercased — see normalizeEmail() in lib/validation.ts.
  // Case-sensitive email uniqueness is a reliable source of duplicate accounts.
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------------------
   leads — website contact form submissions. The core of the CRM.
--------------------------------------------------------------------------- */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message").notNull(),

    // Which page produced the lead: '/contact', '/', '/services/web-development'…
    source: text("source").notNull().default("/"),

    // What they want and how hot it is. Both staff-set during triage — the
    // public form never sends them, so they default to "needs a look".
    category: serviceCategoryEnum("category").notNull().default("general"),
    priority: priorityEnum("priority").notNull().default("medium"),

    status: leadStatusEnum("status").notNull().default("new"),
    assignedStaffId: uuid("assigned_staff_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The dashboard's default view is "newest first, filtered by status".
    index("leads_created_at_idx").on(table.createdAt),
    index("leads_status_idx").on(table.status),
    index("leads_category_idx").on(table.category),
  ],
);

/* ---------------------------------------------------------------------------
   clients — a won lead, promoted into an ongoing relationship. Separate from
   `leads` because the two have different lifecycles: a lead is triaged and
   either won or dropped; a client is worked, tracked, and retained. Contact
   details are copied at conversion so editing a client never rewrites history
   on the originating enquiry.
--------------------------------------------------------------------------- */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email").notNull(),
    phone: text("phone"),

    category: serviceCategoryEnum("category").notNull().default("general"),
    status: clientStatusEnum("status").notNull().default("active"),

    /**
     * The old freeform "deal / value" field ("$2,000/mo retainer"). Superseded
     * by `client_services`, which stores real money the team can add up. Kept
     * read-only so nothing written before the change is lost; the column name
     * stays `value` on purpose — renaming it buys nothing and costs a migration.
     * Drop it once every client has been re-entered as services.
     */
    legacyValue: text("value"),

    assignedStaffId: uuid("assigned_staff_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),

    /**
     * The payment provider's customer id (`cus_…` on Stripe). Written the first
     * time we take money from them and reused after that, so one client is one
     * customer over there rather than a new one per checkout.
     */
    billingCustomerId: text("billing_customer_id"),

    // Provenance. Null for clients added by hand rather than converted.
    sourceLeadId: uuid("source_lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("clients_created_at_idx").on(table.createdAt),
    index("clients_status_idx").on(table.status),
  ],
);

/* ---------------------------------------------------------------------------
   client_tasks — the "what can we do for them next" list: follow-ups, replies,
   deliverables. A task is done or not; an optional due date drives overdue
   surfacing. Cascade-deletes with its client — orphaned tasks help no one.
--------------------------------------------------------------------------- */

export const clientTasks = pgTable(
  "client_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("client_tasks_client_idx").on(table.clientId)],
);

/* ---------------------------------------------------------------------------
   services — the billable catalogue. What KPVE sells: "Emails", "Hosting",
   "Retainer", "Site build". Staff create these themselves, which is the whole
   point: adding a new thing to sell must not require a migration and a deploy.

   Deliberately NOT the same as `service_category` above. That enum mirrors the
   seven marketing service pages and is used to triage enquiries — a fixed list
   tied to the website. This table is what we invoice for, and it changes
   whenever the business changes. Two different ideas that share a word.
--------------------------------------------------------------------------- */

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Stable machine key — lowercased/hyphenated from the name on create.
    slug: text("slug").notNull(),
    description: text("description"),

    // Defaults only. They are copied onto a client_services row at attach time,
    // so repricing the catalogue never silently reprices existing clients.
    defaultAmountCents: integer("default_amount_cents").notNull().default(0),
    defaultCurrency: text("default_currency").notNull().default("AUD"),
    defaultInterval: billingIntervalEnum("default_interval").notNull().default("monthly"),

    // Archive rather than delete — a retired service still has history attached.
    isActive: boolean("is_active").notNull().default(true),

    createdBy: uuid("created_by").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("services_slug_idx").on(table.slug)],
);

/* ---------------------------------------------------------------------------
   client_services — one billable line on a client. A client has many: Emails
   $11/mo + Hosting $30/mo + a one-off $2,500 build are three rows, which is
   exactly what a single `value` column could never express.

   Amount, currency and interval are COPIED from the catalogue at attach time
   (same copy-at-conversion rule used for lead → client). `service_id` is a soft
   link for reporting; the row stands on its own if the catalogue entry is
   deleted, and is nullable so a bespoke one-off line needs no catalogue entry.
--------------------------------------------------------------------------- */

export const clientServices = pgTable(
  "client_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),

    // What this line is called on the client's record. Defaults to the
    // catalogue name, overridable — "Hosting (staging + prod)".
    label: text("label").notNull(),

    // Integer minor units. Never a float: 0.1 + 0.2 is not 0.3, and money that
    // doesn't add up is worse than no money column at all.
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    interval: billingIntervalEnum("interval").notNull().default("monthly"),

    status: clientServiceStatusEnum("status").notNull().default("active"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    // Next date this line should be charged. Auto-computed from startedAt +
    // interval on create, rolled forward by "Mark billed", editable by hand.
    nextBillAt: timestamp("next_bill_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    notes: text("notes"),

    /* ---- Payment link / subscription state (see lib/payments) ----
       Which provider minted the current link ("mock" or "stripe"), its id, and
       the URL to send the client. `checkoutRef` is the unguessable token the
       simulated checkout page is addressed by, so it is unique rather than
       merely indexed. */
    paymentProvider: text("payment_provider"),
    checkoutRef: text("checkout_ref"),
    checkoutUrl: text("checkout_url"),
    checkoutCreatedAt: timestamp("checkout_created_at", { withTimezone: true }),
    /** `sub_…` once a recurring line is a real subscription over at the provider. */
    externalSubscriptionId: text("external_subscription_id"),
    lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("client_services_client_idx").on(table.clientId),
    index("client_services_status_idx").on(table.status),
    // Drives the "upcoming bills" list on the Overview.
    index("client_services_next_bill_idx").on(table.nextBillAt),
    // Postgres allows many NULLs in a unique index, so lines with no link
    // outstanding don't collide.
    uniqueIndex("client_services_checkout_ref_idx").on(table.checkoutRef),
  ],
);

/* ---------------------------------------------------------------------------
   payments — every attempt to take money, whoever took it.

   Rows are written by the payment webhook (or the simulator, which goes through
   the same code path), never by hand-editing a status. `provider_ref` is the
   provider's own id for the event and is UNIQUE: a webhook that Stripe retries
   three times must produce one payment, not three. That unique index is the
   idempotency guarantee, not the application logic around it.

   `client_service_id` is ON DELETE SET NULL — removing a billing line must not
   erase the money that was collected against it.
--------------------------------------------------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    clientServiceId: uuid("client_service_id").references(() => clientServices.id, {
      onDelete: "set null",
    }),

    // "mock" (simulated) or "stripe". Kept on the row so history stays readable
    // after the switch to real payments.
    provider: text("provider").notNull().default("mock"),
    providerRef: text("provider_ref"),

    status: paymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    description: text("description"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_client_idx").on(table.clientId),
    index("payments_status_idx").on(table.status),
    index("payments_paid_at_idx").on(table.paidAt),
    uniqueIndex("payments_provider_ref_idx").on(table.providerRef),
  ],
);

/* ---------------------------------------------------------------------------
   client_notes — the relationship timeline: calls, meetings, emails, updates.

   Replaces reading history out of one ever-growing `clients.notes` blob. Each
   entry is dated and attributed, so "when did we last speak to them" is a
   query rather than an archaeology exercise. `occurred_at` is separate from
   `created_at` because a call logged on Friday may have happened on Tuesday.
--------------------------------------------------------------------------- */

export const clientNotes = pgTable(
  "client_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: noteKindEnum("kind").notNull().default("note"),
    body: text("body").notNull(),
    authorId: uuid("author_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("client_notes_client_idx").on(table.clientId, table.occurredAt)],
);

/* ---------------------------------------------------------------------------
   client_documents — the contract, the brief, the signed quote.

   Links, not uploads: there is no blob storage in this stack, and pointing at
   the Drive/Dropbox file the team already works from beats a second copy that
   silently goes stale.
--------------------------------------------------------------------------- */

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    kind: documentKindEnum("kind").notNull().default("other"),
    addedBy: uuid("added_by").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("client_documents_client_idx").on(table.clientId)],
);

/* ---------------------------------------------------------------------------
   service_task_templates — the onboarding checklist for a catalogue service.

   "Put a client on Hosting" should create the five things we owe them (kickoff
   call, DNS, credentials, staging, go-live) rather than relying on someone
   remembering all five. `offset_days` is days from the attach date, so a
   template is a schedule, not just a list.

   Cascade-deletes with its service: a checklist for a service that no longer
   exists is noise. Tasks already created on clients are untouched — they are
   ordinary client_tasks rows by then.
--------------------------------------------------------------------------- */

export const serviceTaskTemplates = pgTable(
  "service_task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    offsetDays: integer("offset_days").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("service_task_templates_service_idx").on(table.serviceId)],
);

/* ---------------------------------------------------------------------------
   revenue_snapshots — what MRR actually was on a given month.

   The live tables only ever describe *now*: change a price and last month's
   number changes with it. One row per month per currency, written by
   `npm run revenue:snapshot` (or on the first dashboard load of the day), is
   what makes "new vs churned MRR" and a 12-month trend answerable at all.

   Months with no snapshot are reconstructed from service start/cancel dates so
   the chart isn't empty on day one — see lib/dal/revenue.ts.
--------------------------------------------------------------------------- */

export const revenueSnapshots = pgTable(
  "revenue_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // First day of the month it describes, as a plain date: 'YYYY-MM-01'.
    period: date("period").notNull(),
    currency: text("currency").notNull(),
    mrrCents: integer("mrr_cents").notNull().default(0),
    arrCents: integer("arr_cents").notNull().default(0),
    oneOffCents: integer("one_off_cents").notNull().default(0),
    activeLines: integer("active_lines").notNull().default(0),
    payingClients: integer("paying_clients").notNull().default(0),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("revenue_snapshots_period_idx").on(table.period, table.currency)],
);

/* ---------------------------------------------------------------------------
   activity_log — audit trail.
   Deliberately generic (entityType/entityId) so future entities log through
   the same table without a schema change.
--------------------------------------------------------------------------- */

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    action: text("action").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_log_entity_idx").on(table.entityType, table.entityId),
    index("activity_log_created_at_idx").on(table.createdAt),
  ],
);

/* ---------------------------------------------------------------------------
   Inferred types
--------------------------------------------------------------------------- */

export type StaffUser = typeof staffUsers.$inferSelect;
export type NewStaffUser = typeof staffUsers.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export type ServiceCategory = (typeof serviceCategoryEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number];
export type ClientTask = typeof clientTasks.$inferSelect;
export type NewClientTask = typeof clientTasks.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ClientService = typeof clientServices.$inferSelect;
export type NewClientService = typeof clientServices.$inferInsert;
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];
export type ClientServiceStatus = (typeof clientServiceStatusEnum.enumValues)[number];
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type ClientNote = typeof clientNotes.$inferSelect;
export type NoteKind = (typeof noteKindEnum.enumValues)[number];
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type ServiceTaskTemplate = typeof serviceTaskTemplates.$inferSelect;
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
