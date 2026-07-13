-- broker_rates: owner-editable, per-broker deduction rate card (docs/AUCTION.md §7).
-- The schema (packages/db/src/schema/broker-rates.ts) shipped without a migration,
-- so the table was never created and confirmContract's settlement step silently
-- no-opped (no rate card → no settlements). This migration creates the table with
-- the standard factory_isolation RLS policy, mirroring 0010's auction tables.
-- Written idempotently so it is safe to (re-)apply.
CREATE TABLE IF NOT EXISTS "broker_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"broker_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"insurance_per_kg" numeric(10, 4) DEFAULT '0' NOT NULL,
	"public_sale_ex_per_lot" numeric(10, 2) DEFAULT '0' NOT NULL,
	"brokerage_pct" numeric(6, 3) DEFAULT '0' NOT NULL,
	"handling_per_kg" numeric(10, 4) DEFAULT '0' NOT NULL,
	"documentation_per_lot" numeric(10, 2) DEFAULT '0' NOT NULL,
	"eplatform_per_kg" numeric(10, 4) DEFAULT '0' NOT NULL,
	"govt_relief_loan" numeric(14, 2) DEFAULT '0' NOT NULL,
	"charges_vat_pct" numeric(6, 3) DEFAULT '18' NOT NULL,
	"proceeds_vat_pct" numeric(6, 3) DEFAULT '18' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broker_rates_factory_id_factories_id_fk') THEN
		ALTER TABLE "broker_rates" ADD CONSTRAINT "broker_rates_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broker_rates_broker_id_brokers_id_fk') THEN
		ALTER TABLE "broker_rates" ADD CONSTRAINT "broker_rates_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_broker_rates_factory_broker" ON "broker_rates" USING btree ("factory_id","broker_id");--> statement-breakpoint
ALTER TABLE "broker_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "factory_isolation" ON "broker_rates";--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "broker_rates" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
