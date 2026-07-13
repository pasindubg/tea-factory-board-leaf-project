CREATE TABLE "brokers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vat_no" text,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"broker_id" uuid NOT NULL,
	"sale_no" text NOT NULL,
	"sale_date" date,
	"prompt_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"mark_id" uuid,
	"invoice_no" text NOT NULL,
	"lot_no" text,
	"grade" text NOT NULL,
	"bags" integer,
	"kg_per_bag" numeric(8, 2),
	"gross_wt" numeric(10, 2),
	"sample_allowance" numeric(8, 2),
	"net_wt" numeric(10, 2) NOT NULL,
	"store" text,
	"category" text,
	"state" text DEFAULT 'invoiced' NOT NULL,
	"shutout_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"source_filename" text,
	"content_hash" text NOT NULL,
	"parsed_json" jsonb,
	"status" text DEFAULT 'parsed' NOT NULL,
	"sale_id" uuid,
	"parsed_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp
);
--> statement-breakpoint
-- NOTE: water-penalty/transport columns (payment_settings, weighings) were already
-- applied directly to the DB via 0004/0005 but predate the meta snapshot, so
-- drizzle re-emitted them here. Removed to avoid duplicate-column errors; the
-- 0006 snapshot now reconciles the schema. This migration is auction tables only.
ALTER TABLE "brokers" ADD CONSTRAINT "brokers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_sales" ADD CONSTRAINT "auction_sales_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_sales" ADD CONSTRAINT "auction_sales_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_sale_id_auction_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_imports" ADD CONSTRAINT "doc_imports_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_brokers_factory" ON "brokers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_marks_factory" ON "marks" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_marks_factory_code" ON "marks" USING btree ("factory_id","code");--> statement-breakpoint
CREATE INDEX "idx_auction_sales_factory" ON "auction_sales" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_sales_factory_broker_no" ON "auction_sales" USING btree ("factory_id","broker_id","sale_no");--> statement-breakpoint
CREATE INDEX "idx_auction_lots_factory" ON "auction_lots" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_auction_lots_sale" ON "auction_lots" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_doc_imports_factory" ON "doc_imports" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_doc_imports_factory_hash" ON "doc_imports" USING btree ("factory_id","content_hash");--> statement-breakpoint
-- A1 RLS: factory isolation on every new auction table (same policy as 0001/0002).
ALTER TABLE "brokers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auction_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auction_lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "doc_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "brokers" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "marks" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "auction_sales" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "auction_lots" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "doc_imports" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());