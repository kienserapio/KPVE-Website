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
  ],
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
export type ActivityLogEntry = typeof activityLog.$inferSelect;
