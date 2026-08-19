-- Drop duplicates predating the unique indexes, keeping the newest per key.
DELETE FROM "settlement_charges" a
  USING "settlement_charges" b
  WHERE a."settlement_id" = b."settlement_id"
    AND a."code" = b."code"
    AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
DELETE FROM "vat_ledger" a
  USING "vat_ledger" b
  WHERE a."sale_line_id" = b."sale_line_id"
    AND a."flow" = b."flow"
    AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
DROP INDEX "idx_settlement_charges_settlement";--> statement-breakpoint
DROP INDEX "idx_vat_ledger_sale_line";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_settlement_charges_code" ON "settlement_charges" USING btree ("settlement_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vat_ledger_sale_line_flow" ON "vat_ledger" USING btree ("sale_line_id","flow");
