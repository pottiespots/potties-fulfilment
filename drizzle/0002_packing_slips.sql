ALTER TYPE "public"."file_kind" ADD VALUE 'PACKING_SLIP';--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shopify_data" jsonb;