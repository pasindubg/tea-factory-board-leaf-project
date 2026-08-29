ALTER TABLE "auction_lots" ADD COLUMN "skipped_source_lot_id" uuid;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_skipped_source_lot_id_auction_lots_id_fk" FOREIGN KEY ("skipped_source_lot_id") REFERENCES "public"."auction_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Move the link on rows already written before the split. A skipped-sale row
-- is one flagged `skipped_sale` that is NOT a re-print; its link belongs in the
-- new column, and leaving it in reprint_source_lot_id is what made those lots
-- count as "Re-prints sold".
UPDATE "auction_lots"
SET "skipped_source_lot_id" = "reprint_source_lot_id",
    "reprint_source_lot_id" = NULL
WHERE "skipped_sale" = true
  AND "reprint" = false
  AND "reprint_source_lot_id" IS NOT NULL;
