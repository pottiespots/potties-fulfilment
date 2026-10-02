CREATE TABLE "cash_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'shopify' NOT NULL,
	"order_name" text,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"gateway" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cash_ledger_at_idx" ON "cash_ledger" USING btree ("occurred_at");