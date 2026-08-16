-- 0049 — record which screen opened a Broker Invoice.
--
-- At go-live a factory has re-prints outstanding from sales that happened
-- before this system existed. Those are entered on the Re-prints page as real
-- lots under a real Broker Invoice, so the whole broker/sale/settlement flow
-- applies to them unchanged. `entry_source` is what tells the two apart on
-- screen: a cutover re-print entry is badged instead of reading as a physical
-- dispatch that never happened.
--
-- Written to heal rather than fail: every statement is idempotent and existing
-- rows take the 'invoice' default, which is what they all are.

ALTER TABLE "auction_sales"
  ADD COLUMN IF NOT EXISTS "entry_source" text DEFAULT 'invoice' NOT NULL;
--> statement-breakpoint
-- Defensive: a column added by an earlier partial run could exist as nullable.
UPDATE "auction_sales" SET "entry_source" = 'invoice' WHERE "entry_source" IS NULL;
--> statement-breakpoint
ALTER TABLE "auction_sales" ALTER COLUMN "entry_source" SET DEFAULT 'invoice';
--> statement-breakpoint
ALTER TABLE "auction_sales" ALTER COLUMN "entry_source" SET NOT NULL;
--> statement-breakpoint
-- Any value outside the pair is normalised to 'invoice' BEFORE the constraint
-- is added, so no pre-existing row can block the deploy.
UPDATE "auction_sales"
  SET "entry_source" = 'invoice'
  WHERE "entry_source" NOT IN ('invoice', 'reprint-register');
--> statement-breakpoint
-- Dropped first so re-running this file is harmless.
ALTER TABLE "auction_sales" DROP CONSTRAINT IF EXISTS "auction_sales_entry_source_check";
--> statement-breakpoint
ALTER TABLE "auction_sales"
  ADD CONSTRAINT "auction_sales_entry_source_check"
  CHECK ("entry_source" IN ('invoice', 'reprint-register'));
--> statement-breakpoint
-- The one-open-invoice-per broker + mark + dispatch date rule now keys on
-- entry_source too, so a cutover re-print entry never collides with (or gets
-- merged into) an open dispatch invoice for the same broker, mark and date.
DROP INDEX IF EXISTS "uq_auction_sales_open_broker_mark";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_auction_sales_open_broker_mark"
  ON "auction_sales" USING btree ("factory_id","broker_id","selling_mark_id","dispatch_date","entry_source")
  WHERE "sale_kind" = 'dispatch' AND "status" IN ('draft', 'dispatched') AND "selling_mark_id" IS NOT NULL;
