CREATE TABLE "quality_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bonus_kind" text NOT NULL,
	"bonus_value" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"tier_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text,
	"assigned_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"factory_id" uuid PRIMARY KEY NOT NULL,
	"transport_per_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"default_water_penalty_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"amount" numeric(12, 2),
	"percent" numeric(5, 2),
	"occurred_on" date NOT NULL,
	"period_year" integer,
	"period_month" integer,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"factory_id" uuid NOT NULL,
	"line_type" text NOT NULL,
	"label" text,
	"quantity" numeric(12, 2),
	"rate" numeric(10, 2),
	"amount" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gross_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bonus_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bonus_missed" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "deduction_amount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "generated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_tiers" ADD CONSTRAINT "quality_tiers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_tiers" ADD CONSTRAINT "supplier_tiers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_tiers" ADD CONSTRAINT "supplier_tiers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_tiers" ADD CONSTRAINT "supplier_tiers_tier_id_quality_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."quality_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_tiers" ADD CONSTRAINT "supplier_tiers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quality_tiers_factory" ON "quality_tiers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_tiers_factory" ON "supplier_tiers" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_tiers_supplier" ON "supplier_tiers" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_adjustments_factory" ON "supplier_adjustments" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_adjustments_supplier" ON "supplier_adjustments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_payment_lines_payment" ON "payment_lines" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_payment_lines_factory" ON "payment_lines" USING btree ("factory_id");--> statement-breakpoint
-- M6 RLS: factory isolation on every new table (same policy as 0001).
ALTER TABLE "quality_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "quality_tiers" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "supplier_tiers" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "payment_settings" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "supplier_adjustments" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "payment_lines" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
