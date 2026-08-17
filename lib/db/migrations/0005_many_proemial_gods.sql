ALTER TABLE "invoice_lines" ADD COLUMN "periods" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "cover_months" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "checkout_ref" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "checkout_created_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_checkout_ref_idx" ON "invoices" USING btree ("checkout_ref");