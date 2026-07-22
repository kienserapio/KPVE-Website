import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
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

    // Freeform on purpose — "$2,000/mo retainer", "Project — TBC". A numeric
    // column would force a currency and a shape the team hasn't committed to.
    value: text("value"),

    assignedStaffId: uuid("assigned_staff_id").references(() => staffUsers.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),

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
export type ActivityLogEntry = typeof activityLog.$inferSelect;
