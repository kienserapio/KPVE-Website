CREATE TYPE "public"."client_type" AS ENUM('individual', 'company');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."tax_mode" AS ENUM('none', 'inclusive', 'exclusive');--> statement-breakpoint
CREATE TABLE "client_service_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_service_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_service_id" uuid,
	"label" text NOT NULL,
	"description" text,
	"unit_amount_cents" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"details" text,
	"period_start" date,
	"period_end" date,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_mode" "tax_mode" DEFAULT 'none' NOT NULL,
	"seller_name" text NOT NULL,
	"seller_abn" text,
	"seller_address" text,
	"seller_email" text,
	"bill_to_name" text NOT NULL,
	"bill_to_abn" text,
	"bill_to_email" text,
	"bill_to_address" text,
	"public_token" text NOT NULL,
	"notes" text,
	"po_number" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text DEFAULT 'KPVE' NOT NULL,
	"trading_name" text,
	"abn" text,
	"address" text,
	"email" text DEFAULT 'support@kpve.com' NOT NULL,
	"phone" text,
	"website" text,
	"gst_registered" boolean DEFAULT false NOT NULL,
	"tax_rate_bps" integer DEFAULT 1000 NOT NULL,
	"prices_include_tax" boolean DEFAULT true NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"payment_terms_days" integer DEFAULT 14 NOT NULL,
	"invoice_footer" text,
	"bank_name" text,
	"bsb" text,
	"account_name" text,
	"account_number" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_services" ADD COLUMN "unit_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_services" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "client_type" "client_type" DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "parent_client_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_abn" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "unit_label" text;--> statement-breakpoint
ALTER TABLE "client_service_items" ADD CONSTRAINT "client_service_items_client_service_id_client_services_id_fk" FOREIGN KEY ("client_service_id") REFERENCES "public"."client_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_client_service_id_client_services_id_fk" FOREIGN KEY ("client_service_id") REFERENCES "public"."client_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_staff_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_updated_by_staff_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_service_items_line_idx" ON "client_service_items" USING btree ("client_service_id","position");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_idx" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_public_token_idx" ON "invoices" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "invoices_client_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_issue_date_idx" ON "invoices" USING btree ("issue_date");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_parent_client_id_clients_id_fk" FOREIGN KEY ("parent_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_parent_idx" ON "clients" USING btree ("parent_client_id");--> statement-breakpoint
CREATE INDEX "clients_type_idx" ON "clients" USING btree ("client_type");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
-- Hand-written backfill (drizzle-kit does not generate data migrations).
--
-- Every client_services row that existed before this migration was a single
-- unit: `amount_cents` was typed in whole and there was no quantity. ADD COLUMN
-- gave them unit_amount_cents = 0, which would make the line read "0 × 1" and
-- break the invariant that amount_cents = unit_amount_cents × quantity the
-- first time anything recomputed it.
--
-- So: the old total IS the unit price, and the quantity is 1. Guarded by
-- unit_amount_cents = 0 so re-running this can never overwrite a real price.
UPDATE "client_services"
SET "unit_amount_cents" = "amount_cents",
    "quantity" = 1
WHERE "unit_amount_cents" = 0;