-- A3/A4: Settlements, settlement charges, VAT ledger, and bank transactions.
-- See docs/AUCTION.md §5 data model and §4③ (VAT split) / §4④ (bank reconciliation).
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"contract_no" text NOT NULL,
	"proceeds_total" numeric(14, 2) NOT NULL,
	"total_deductions" numeric(14, 2) NOT NULL,
	"net_proceeds" numeric(14, 2) NOT NULL,
	"output_vat" numeric(14, 2) NOT NULL,
	"total_net_proceeds" numeric(14, 2) NOT NULL,
	"prompt_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"settlement_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"basis" text NOT NULL,
	"rate" numeric(12, 4),
	"amount" numeric(14, 2) NOT NULL,
	"sort_order" numeric(4, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"flow" text NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"mode" text NOT NULL,
	"guarantee_due_date" date,
	"realised_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_txns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"txn_date" date NOT NULL,
	"description" text,
	"debit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"running_balance" numeric(14, 2),
	"cheque_no" text,
	"raw_line" text,
	"import_batch_id" uuid,
	"matched_settlement_id" uuid,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_sale_id_auction_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."auction_sales"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settlement_charges" ADD CONSTRAINT "settlement_charges_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "settlement_charges" ADD CONSTRAINT "settlement_charges_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vat_ledger" ADD CONSTRAINT "vat_ledger_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vat_ledger" ADD CONSTRAINT "vat_ledger_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_txns" ADD CONSTRAINT "bank_txns_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bank_txns" ADD CONSTRAINT "bank_txns_matched_settlement_id_settlements_id_fk" FOREIGN KEY ("matched_settlement_id") REFERENCES "public"."settlements"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_settlements_factory" ON "settlements" USING btree ("factory_id");
--> statement-breakpoint
CREATE INDEX "idx_settlements_sale" ON "settlements" USING btree ("sale_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_settlements_contract" ON "settlements" USING btree ("factory_id", "contract_no");
--> statement-breakpoint
CREATE INDEX "idx_settlement_charges_settlement" ON "settlement_charges" USING btree ("settlement_id");
--> statement-breakpoint
CREATE INDEX "idx_settlement_charges_factory" ON "settlement_charges" USING btree ("factory_id");
--> statement-breakpoint
CREATE INDEX "idx_vat_ledger_factory" ON "vat_ledger" USING btree ("factory_id");
--> statement-breakpoint
CREATE INDEX "idx_vat_ledger_sale_line" ON "vat_ledger" USING btree ("sale_line_id");
--> statement-breakpoint
CREATE INDEX "idx_bank_txns_factory" ON "bank_txns" USING btree ("factory_id");
--> statement-breakpoint
CREATE INDEX "idx_bank_txns_date" ON "bank_txns" USING btree ("txn_date");
--> statement-breakpoint
CREATE INDEX "idx_bank_txns_settlement" ON "bank_txns" USING btree ("matched_settlement_id");
--> statement-breakpoint
-- RLS factory isolation on every new table.
ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settlement_charges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vat_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_txns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "settlements" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "settlement_charges" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "vat_ledger" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "bank_txns" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
