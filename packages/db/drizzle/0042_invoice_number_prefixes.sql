CREATE TABLE "invoice_number_prefixes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"category" text NOT NULL,
	"prefix" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_by" uuid,
	"activated_at" timestamp,
	CONSTRAINT "invoice_number_prefixes_category_check" CHECK ("invoice_number_prefixes"."category" IN ('broker_invoice', 'regular_invoice'))
);
--> statement-breakpoint
CREATE TABLE "invoice_prefix_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"category" text NOT NULL,
	"requested_prefix_id" uuid NOT NULL,
	"context_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp,
	"created_record_id" uuid,
	"note" text,
	CONSTRAINT "invoice_prefix_exceptions_category_check" CHECK ("invoice_prefix_exceptions"."category" IN ('broker_invoice', 'regular_invoice')),
	CONSTRAINT "invoice_prefix_exceptions_status_check" CHECK ("invoice_prefix_exceptions"."status" IN ('pending', 'approved', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "invoice_number_prefixes" ADD CONSTRAINT "invoice_number_prefixes_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_prefixes" ADD CONSTRAINT "invoice_number_prefixes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_prefixes" ADD CONSTRAINT "invoice_number_prefixes_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_prefix_exceptions" ADD CONSTRAINT "invoice_prefix_exceptions_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_prefix_exceptions" ADD CONSTRAINT "invoice_prefix_exceptions_requested_prefix_id_invoice_number_prefixes_id_fk" FOREIGN KEY ("requested_prefix_id") REFERENCES "public"."invoice_number_prefixes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_prefix_exceptions" ADD CONSTRAINT "invoice_prefix_exceptions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_prefix_exceptions" ADD CONSTRAINT "invoice_prefix_exceptions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_number_prefixes_factory" ON "invoice_number_prefixes" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_number_prefixes_factory_category_prefix" ON "invoice_number_prefixes" USING btree ("factory_id","category","prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_number_prefixes_factory_category_active" ON "invoice_number_prefixes" USING btree ("factory_id","category") WHERE "active" = true;--> statement-breakpoint
CREATE INDEX "idx_invoice_prefix_exceptions_factory" ON "invoice_prefix_exceptions" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_prefix_exceptions_status" ON "invoice_prefix_exceptions" USING btree ("status");
--> statement-breakpoint

ALTER TABLE "invoice_number_prefixes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_prefix_exceptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "factory_isolation" ON "invoice_number_prefixes" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "invoice_prefix_exceptions" FOR ALL TO authenticated
  USING ("factory_id" = public.current_factory_id())
  WITH CHECK ("factory_id" = public.current_factory_id());
--> statement-breakpoint

-- Bootstrap: give every existing factory one active prefix per category so
-- broker/lot invoice creation isn't blocked the moment this ships. Cycle 01,
-- current year. Later prefixes are created/activated through the app.
INSERT INTO "invoice_number_prefixes" ("factory_id", "category", "prefix", "active", "created_at", "activated_at")
SELECT "id", "category", to_char(now(), 'YY') || letter || '01', true, now(), now()
FROM "factories"
CROSS JOIN (VALUES ('broker_invoice', 'B'), ('regular_invoice', 'I')) AS c("category", "letter");