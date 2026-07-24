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
  type AnyPgColumn,
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

/**
 * Whether a client record is a person or a business. A real client is often
 * both — one individual who owns several companies — so the two live in the
 * same table and point at each other (see `clients.parent_client_id`) rather
 * than in two tables that would need joining back together on every page.
 */
export const clientTypeEnum = pgEnum("client_type", ["individual", "company"]);

/**
 * Lifecycle of an issued document. `draft` is the only editable state: once an
 * invoice is `sent` it is a record someone may have filed, so the correction is
 * void-and-reissue, never an edit. `void` keeps the number burnt rather than
 * reusing it, which is what makes a numbering sequence auditable.
 */
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);

/**
 * How tax was applied to an invoice AT ISSUE. `none` = not GST registered, and
 * that is both the default and legal. `inclusive` = the stored amounts already
 * contain the tax (the Australian norm); `exclusive` = tax is added on top.
 * Stored on the invoice, not read from settings, so changing registration next
 * year cannot rewrite what last year's invoice said.
 */
export const taxModeEnum = pgEnum("tax_mode", ["none", "inclusive", "exclusive"]);

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

    /**
     * Person or business. Existing rows default to `individual`, which is what
     * every client entered before this column already was.
     */
    clientType: clientTypeEnum("client_type").notNull().default("individual"),

    /**
     * The human at a company — "Dimitrios Kappatos" on "Rare Gem Exchange Pty
     * Ltd". Null on an individual, where `name` IS the person. On a company
     * `name` is the trading name and this is who we actually talk to.
     */
    contactName: text("contact_name"),

    /**
     * The individual who owns this company. ON DELETE SET NULL, deliberately
     * NOT cascade: deleting the individual must ORPHAN the companies, never
     * delete them, because those companies are still being billed and their
     * invoices are still on someone's books.
     *
     * One level only (a company cannot own a company) — enforced in the DAL
     * rather than by a constraint, because a tree of arbitrary depth turns
     * every roll-up into a recursive query for a case nobody has.
     *
     * Drizzle needs the explicit return type on a self-reference; without it
     * the column's type is inferred circularly and TypeScript gives up.
     */
    parentClientId: uuid("parent_client_id").references((): AnyPgColumn => clients.id, {
      onDelete: "set null",
    }),

    category: serviceCategoryEnum("category").notNull().default("general"),
    status: clientStatusEnum("status").notNull().default("active"),

    /* ---- Billing profile ----
       Who this client is to the tax office, which is regularly not who they
       are to us: the legal entity behind a trading name, and accounts@ rather
       than the person we email. All nullable and all fall back to the contact
       details above when blank, so a client who needs none of this needs to
       fill in none of it. Copied onto an invoice at issue, never read live. */
    billingName: text("billing_name"),
    billingAbn: text("billing_abn"),
    billingEmail: text("billing_email"),
    billingAddress: text("billing_address"),

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
    // "the companies this individual owns" is a card on every individual's page.
    index("clients_parent_idx").on(table.parentClientId),
    index("clients_type_idx").on(table.clientType),
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

    /**
     * What one unit of this service IS: "mailbox", "seat", "page", "domain".
     * Null for things that aren't counted. It's the difference between a line
     * reading "4 × $11.00/mo" and "4 mailboxes × $11.00/mo" — the second one
     * tells you what four means without opening the client.
     */
    unitLabel: text("unit_label"),

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

    /**
     * The price of ONE of the thing, and how many of them. "4 emails at $11"
     * is one line with unit 1100 and quantity 4 — not four rows, and not a
     * retyped 4400 that nobody can check.
     */
    unitAmountCents: integer("unit_amount_cents").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),

    /**
     * INVARIANT: `amount_cents` is the LINE TOTAL and is always written as
     * `unit_amount_cents × quantity`.
     *
     * It is read by the MRR SQL in lib/dal/clients.ts, by summarize(), by the
     * revenue snapshots, by the CSV export, by the Stripe `price_data` and by
     * the upcoming-bills list. Keeping it the total is what stops any of them
     * disagreeing about what a line is worth — none of them had to change when
     * quantity arrived. The invariant is enforced in exactly one place, the
     * DAL write path, because a stored derived value that drifts is worse than
     * no column at all.
     *
     * Integer minor units. Never a float: 0.1 + 0.2 is not 0.3, and money that
     * doesn't add up is worse than no money column at all.
     */
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
   client_service_items — the actual things provisioned under a billing line.

   On an "Emails × 4" line these are the four mailbox addresses; on Hosting the
   domains; on a build the deliverables. One row each.

   Why a table and not a text blob on the line: they are added and removed one
   at a time over the life of an account (a fifth mailbox in March), they are
   snapshotted onto invoices individually, and "the fourth line of a textarea"
   is not a thing you can delete safely.

   Cascade-deletes with its line — an address with no service behind it is not
   a record of anything. The invoice keeps its own flattened copy (see
   invoice_lines.details), so deleting these never rewrites an issued document.
--------------------------------------------------------------------------- */

export const clientServiceItems = pgTable(
  "client_service_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientServiceId: uuid("client_service_id")
      .notNull()
      .references(() => clientServices.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // Staff order, not insertion order — the list is theirs to arrange.
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("client_service_items_line_idx").on(table.clientServiceId, table.position),
  ],
);

/* ---------------------------------------------------------------------------
   org_settings — a single row: who KPVE is, on paper.

   Why a table and not env vars: the same argument that made the service
   catalogue a table. An ABN or a bank account changing must not be a deploy,
   and the person who knows the right value is not the person with access to
   the host's environment. Edited at /admin/settings.

   Read live by the invoice builder and copied onto each invoice at issue, so
   changing anything here affects the next invoice and never a past one.
--------------------------------------------------------------------------- */

export const orgSettings = pgTable("org_settings", {
  id: uuid("id").primaryKey().defaultRandom(),

  /* ---- Identity: what prints at the top of a tax invoice ---- */
  legalName: text("legal_name").notNull().default("KPVE"),
  tradingName: text("trading_name"),
  abn: text("abn"),
  address: text("address"),
  email: text("email").notNull().default("support@kpve.com"),
  phone: text("phone"),
  website: text("website"),

  /* ---- Tax ----
     Off by default, which prints no tax line at all and is correct and legal
     for a business that isn't registered. `tax_rate_bps` is basis points so
     10% and 10.5% are both exact integers — a float rate would round money.
     `prices_include_tax` defaults true (the Australian norm): stored amounts
     do not change, the invoice just says the total includes GST. */
  gstRegistered: boolean("gst_registered").notNull().default(false),
  taxRateBps: integer("tax_rate_bps").notNull().default(1000),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),

  /* ---- Invoicing ----
     `invoice_prefix` + year + counter is the number ("INV-2026-0001").
     The EFT block is for clients who won't use a card, which is most of the
     ones who ask for an invoice in the first place. */
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  invoiceFooter: text("invoice_footer"),
  bankName: text("bank_name"),
  bsb: text("bsb"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),

  updatedBy: uuid("updated_by").references(() => staffUsers.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------------------
   invoices — the document a client's accountant can actually file.

   A payment link takes money; this records what the money was for, in the form
   the tax office recognises. The CRM could do the first without the second,
   which is exactly the gap a real client walked into.

   Everything about the parties and the tax rules is SNAPSHOTTED here at issue.
   Same copy-at-conversion rule used for lead → client: an issued invoice is a
   record of a moment. KPVE moving office next year must not rewrite last
   year's invoices, and a document that changes after it is issued is a
   compliance problem rather than a convenience.
--------------------------------------------------------------------------- */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    /**
     * "INV-2026-0001". This UNIQUE index IS the numbering guarantee — not the
     * application logic around it. Allocation is max+1 with a bounded retry
     * (the same pattern as uniqueSlug()), so two people pressing "Create
     * invoice" at the same moment get two numbers rather than one number and
     * a 500.
     */
    number: text("number").notNull(),

    status: invoiceStatusEnum("status").notNull().default("draft"),

    // Plain dates, not timestamps: an invoice is issued on a day, not at an
    // instant, and nobody wants a due date that moves with a timezone.
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    currency: text("currency").notNull().default("AUD"),

    /* ---- Money, all integer minor units ----
       Held on the invoice rather than recomputed from the lines, because the
       lines can be deleted and the tax rate can change; the printed document
       must keep saying what it said. */
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),

    /** The tax rules in force AT ISSUE — see the taxModeEnum comment. */
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxMode: taxModeEnum("tax_mode").notNull().default("none"),

    /* ---- Party snapshots: copy-at-issue, never a live lookup ---- */
    sellerName: text("seller_name").notNull(),
    sellerAbn: text("seller_abn"),
    sellerAddress: text("seller_address"),
    sellerEmail: text("seller_email"),
    billToName: text("bill_to_name").notNull(),
    billToAbn: text("bill_to_abn"),
    billToEmail: text("bill_to_email"),
    billToAddress: text("bill_to_address"),

    /**
     * 32 hex characters, the client's own link at /invoice/<token>. The link
     * IS the credential — exactly how /pay/[ref] already works. There is no
     * client login to hang this off, and a guessable id would be worse than
     * an unguessable token.
     */
    publicToken: text("public_token").notNull(),

    notes: text("notes"),
    poNumber: text("po_number"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),

    createdBy: uuid("created_by").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_number_idx").on(table.number),
    uniqueIndex("invoices_public_token_idx").on(table.publicToken),
    index("invoices_client_idx").on(table.clientId),
    // The collections queue is "status = sent, due_date in the past".
    index("invoices_status_idx").on(table.status),
    index("invoices_issue_date_idx").on(table.issueDate),
  ],
);

/* ---------------------------------------------------------------------------
   invoice_lines — one row of the printed document.

   A frozen copy of a client_services line, not a view onto it. `label`,
   `unit_amount_cents`, `quantity` and `amount_cents` are all written at issue
   and never follow a later reprice.
--------------------------------------------------------------------------- */

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    /**
     * Soft link back to the billing line this came from, for "what have we
     * invoiced for Hosting". ON DELETE SET NULL: deleting a billing line must
     * not gut an issued invoice.
     */
    clientServiceId: uuid("client_service_id").references(() => clientServices.id, {
      onDelete: "set null",
    }),

    label: text("label").notNull(),
    description: text("description"),

    unitAmountCents: integer("unit_amount_cents").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    amountCents: integer("amount_cents").notNull().default(0),

    /**
     * The provisioned items (client_service_items), flattened to newline-
     * separated text at issue time. A snapshot, not a join: removing a mailbox
     * in March must not change what the February invoice said was supplied.
     */
    details: text("details"),

    // "1 Aug – 31 Aug" — what makes a recurring invoice make sense to whoever
    // files it six months later.
    periodStart: date("period_start"),
    periodEnd: date("period_end"),

    position: integer("position").notNull().default(0),
  },
  (table) => [index("invoice_lines_invoice_idx").on(table.invoiceId, table.position)],
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

    /**
     * The document this money settles, when there is one. Nullable — a payment
     * link taken against a service line has no invoice behind it, and that is
     * still a real payment. ON DELETE SET NULL for the same reason as the line
     * above: deleting a draft invoice must not erase money that was collected.
     */
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
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
    // "what has been paid against this invoice" — read on every invoice screen.
    index("payments_invoice_idx").on(table.invoiceId),
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
export type ClientType = (typeof clientTypeEnum.enumValues)[number];
export type ClientTask = typeof clientTasks.$inferSelect;
export type NewClientTask = typeof clientTasks.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ClientService = typeof clientServices.$inferSelect;
export type NewClientService = typeof clientServices.$inferInsert;
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];
export type ClientServiceStatus = (typeof clientServiceStatusEnum.enumValues)[number];
/**
 * Named ...Row, not ClientServiceItem: `ClientServiceItem` is already an
 * exported type in lib/dal/services.ts (a billing line joined with its
 * catalogue entry, which is what the UI consumes). Two different shapes with
 * one name in two modules is an import collision waiting to be debugged, so
 * the raw table row carries the suffix.
 */
export type ClientServiceItemRow = typeof clientServiceItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;
export type TaxMode = (typeof taxModeEnum.enumValues)[number];
export type ClientNote = typeof clientNotes.$inferSelect;
export type NoteKind = (typeof noteKindEnum.enumValues)[number];
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type ServiceTaskTemplate = typeof serviceTaskTemplates.$inferSelect;
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
