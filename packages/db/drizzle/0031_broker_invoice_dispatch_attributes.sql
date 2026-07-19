-- Broker Invoice transport attributes and its normalized daily bundled-dispatch
-- relationship. Existing invoices remain editable; future invoices are created
-- with all attributes and are attached to the day's automatic dispatch.

ALTER TABLE "auction_bundled_dispatches"
  ADD COLUMN "auto_created" boolean DEFAULT false NOT NULL;

ALTER TABLE "auction_sales"
  ADD COLUMN "selling_mark_id" uuid REFERENCES "marks"("id") ON DELETE RESTRICT,
  ADD COLUMN "broker_lorry_no" text,
  ADD COLUMN "driver_name" text,
  ADD COLUMN "bundled_dispatch_id" uuid REFERENCES "auction_bundled_dispatches"("id") ON DELETE SET NULL;

-- Keep the pre-existing join table and the direct invoice attribute aligned for
-- historical manually bundled invoices.
UPDATE "auction_sales" AS sale
SET "bundled_dispatch_id" = link."bundled_dispatch_id"
FROM "auction_bundled_dispatch_invoices" AS link
WHERE link."broker_invoice_id" = sale."id"
  AND sale."bundled_dispatch_id" IS NULL;

CREATE INDEX "idx_auction_sales_bundled_dispatch"
  ON "auction_sales" USING btree ("bundled_dispatch_id");

-- A broker may carry a selling mark only once in a physical dispatch. Nulls
-- remain distinct so historical invoices with no captured mark are preserved.
CREATE UNIQUE INDEX "uq_auction_sales_bundle_broker_mark"
  ON "auction_sales" ("factory_id", "bundled_dispatch_id", "broker_id", "selling_mark_id");

-- Exactly one automatically-created one-day bundle exists per factory/date.
CREATE UNIQUE INDEX "uq_auction_auto_bundle_factory_date"
  ON "auction_bundled_dispatches" ("factory_id", "dispatch_date_from")
  WHERE "auto_created" AND "dispatch_date_from" = "dispatch_date_to";
