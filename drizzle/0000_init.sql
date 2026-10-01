CREATE TYPE "public"."file_kind" AS ENUM('PHOTO_PRODUCT', 'PHOTO_CUSTOM', 'PHOTO_PACKED', 'PHOTO_WAYBILL', 'WAYBILL', 'ARTWORK', 'OTHER', 'INVOICE', 'POP');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('ORDERED', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('HQ', 'FOUNDRY');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."supplier" AS ENUM('FOUNDRY', 'LL');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"purchase_order_id" uuid,
	"user_id" uuid,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_line_id" text,
	"title" text NOT NULL,
	"variant" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"custom_type" text,
	"custom_text" text,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"invoice_id" uuid,
	"kind" "file_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_id" text,
	"name" text NOT NULL,
	"stage" "stage" DEFAULT 'NEW' NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"customer_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address1" text,
	"address2" text,
	"city" text,
	"province" text,
	"zip" text,
	"country" text,
	"delivery_note" text,
	"courier" text,
	"courier_service" text,
	"ship_by" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"packed_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"tracking_number" text,
	"tracking_company" text,
	"shopify_fulfillment_id" text,
	"shopify_sync_error" text,
	"hq_custom_checked" boolean DEFAULT false NOT NULL,
	"foundry_custom_checked" boolean DEFAULT false NOT NULL,
	"slip_in_box" boolean DEFAULT false NOT NULL,
	"proof_approved_at" timestamp with time zone,
	"open_question" text,
	"open_question_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"supplier" "supplier" NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"in_production" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"supplier" "supplier" DEFAULT 'LL' NOT NULL,
	"status" "po_status" DEFAULT 'ORDERED' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier" "supplier" NOT NULL,
	"number" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"order_id" uuid,
	"purchase_order_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_order_idx" ON "events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "line_items_order_idx" ON "line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_files_order_idx" ON "order_files" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_files_invoice_idx" ON "order_files" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_shopify_id_idx" ON "orders" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "orders_stage_idx" ON "orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "orders_ship_by_idx" ON "orders" USING btree ("ship_by");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_idx" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "supplier_invoices_order_idx" ON "supplier_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");