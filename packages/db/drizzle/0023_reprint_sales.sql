-- 0023 — first-class re-print detail records.
--
-- Re-prints reuse auction_sales/auction_lots so valuation, seller contract,
-- sold/settled status, and existing detail pages keep one workflow. The
-- business key is parent dispatch + reprint_no. sale_no remains unique and is
-- stored as e.g. 0006-R0001 for re-print records.

ALTER TABLE "auction_sales"
  ADD COLUMN IF NOT EXISTS "sale_kind" text DEFAULT 'dispatch' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auction_sales"
  ADD COLUMN IF NOT EXISTS "parent_sale_id" uuid;
--> statement-breakpoint
ALTER TABLE "auction_sales"
  ADD COLUMN IF NOT EXISTS "reprint_no" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auction_sales_parent_sale_id_fk'
  ) THEN
    ALTER TABLE "auction_sales"
      ADD CONSTRAINT "auction_sales_parent_sale_id_fk"
      FOREIGN KEY ("parent_sale_id") REFERENCES "public"."auction_sales"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auction_sales_sale_kind_check'
  ) THEN
    ALTER TABLE "auction_sales"
      ADD CONSTRAINT "auction_sales_sale_kind_check"
      CHECK ("sale_kind" IN ('dispatch', 'reprint'));
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auction_sales_parent_sale"
  ON "auction_sales" USING btree ("parent_sale_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_auction_sales_factory_parent_reprint_no"
  ON "auction_sales" USING btree ("factory_id","parent_sale_id","reprint_no")
  WHERE "sale_kind" = 'reprint';
