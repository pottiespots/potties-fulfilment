ALTER TABLE "orders" ADD COLUMN "tracking_email_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_checked_at" timestamp with time zone;