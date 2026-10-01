ALTER TYPE "public"."supplier" ADD VALUE 'OTHER';--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_files" ADD COLUMN "drive_url" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "supplier_label" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "drive_url" text;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "source" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "paid_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_invoices_number_idx" ON "supplier_invoices" USING btree ("supplier","number");