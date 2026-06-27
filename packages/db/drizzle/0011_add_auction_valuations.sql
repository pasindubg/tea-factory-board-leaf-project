CREATE TABLE "valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"projected_proceeds" numeric(14, 2),
	"tasting_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vat_no" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"buyer_id" uuid,
	"gross_wt" numeric(10, 2),
	"sample_allowance" numeric(8, 2),
	"net_wt" numeric(10, 2) NOT NULL,
	"price_per_kg" numeric(12, 2) NOT NULL,
	"proceeds" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"on_guarantee" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_auction_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_lot_id_auction_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_buyer_id_buyers_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."buyers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_valuations_factory" ON "valuations" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_valuations_lot" ON "valuations" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "idx_buyers_factory" ON "buyers" USING btree ("factory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_buyers_factory_name" ON "buyers" USING btree ("factory_id","name");--> statement-breakpoint
CREATE INDEX "idx_sale_lines_factory" ON "sale_lines" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "idx_sale_lines_sale" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sale_lines_lot" ON "sale_lines" USING btree ("lot_id");--> statement-breakpoint
-- A2 RLS: factory isolation on every new table (same policy as 0001/0002/0006).
ALTER TABLE "valuations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "buyers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "valuations" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "buyers" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "sale_lines" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());