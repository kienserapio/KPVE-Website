CREATE TYPE "public"."autopay_attempt_status" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "autopay_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "autopay_attempt_status" DEFAULT 'started' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'AUD' NOT NULL,
	"payment_intent_id" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_autopay" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"payment_method_id" text,
	"card_brand" text,
	"card_last4" text,
	"card_exp_month" integer,
	"card_exp_year" integer,
	"setup_ref" text,
	"setup_url" text,
	"setup_created_at" timestamp with time zone,
	"consent_text" text,
	"consent_at" timestamp with time zone,
	"consent_ip" text,
	"consent_user_agent" text,
	"consent_by" uuid,
	"enabled_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"last_charge_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_code" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "autopay_notice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "autopay_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "autopay_max_invoices_per_run" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "autopay_max_cents_per_run" integer DEFAULT 500000 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "autopay_max_invoice_cents" integer DEFAULT 200000 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "autopay_notice_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "autopay_attempts" ADD CONSTRAINT "autopay_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopay_attempts" ADD CONSTRAINT "autopay_attempts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_autopay" ADD CONSTRAINT "client_autopay_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_autopay" ADD CONSTRAINT "client_autopay_consent_by_client_users_id_fk" FOREIGN KEY ("consent_by") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autopay_attempts_invoice_attempt_idx" ON "autopay_attempts" USING btree ("invoice_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "autopay_attempts_idempotency_idx" ON "autopay_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "autopay_attempts_payment_intent_idx" ON "autopay_attempts" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "autopay_attempts_client_idx" ON "autopay_attempts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_autopay_setup_ref_idx" ON "client_autopay" USING btree ("setup_ref");--> statement-breakpoint
CREATE INDEX "client_autopay_enabled_idx" ON "client_autopay" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "invoices_status_due_date_idx" ON "invoices" USING btree ("status","due_date");