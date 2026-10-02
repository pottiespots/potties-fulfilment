ALTER TABLE "orders" ADD COLUMN "address_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_edited_by" text;