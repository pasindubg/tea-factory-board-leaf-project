-- Dispatches can span an inclusive date range. Existing one-day dispatches are
-- preserved by using their original dispatch_date for both bounds.
ALTER TABLE "auction_bundled_dispatches"
  ADD COLUMN "dispatch_date_from" date,
  ADD COLUMN "dispatch_date_to" date;

UPDATE "auction_bundled_dispatches"
SET "dispatch_date_from" = "dispatch_date",
    "dispatch_date_to" = "dispatch_date"
WHERE "dispatch_date_from" IS NULL OR "dispatch_date_to" IS NULL;

ALTER TABLE "auction_bundled_dispatches"
  ALTER COLUMN "dispatch_date_from" SET NOT NULL,
  ALTER COLUMN "dispatch_date_to" SET NOT NULL,
  ADD CONSTRAINT "auction_bundled_dispatches_date_range_check"
    CHECK ("dispatch_date_from" <= "dispatch_date_to");

CREATE INDEX "idx_auction_bundled_dispatches_factory_date_range"
  ON "auction_bundled_dispatches" USING btree ("factory_id", "dispatch_date_from", "dispatch_date_to");
