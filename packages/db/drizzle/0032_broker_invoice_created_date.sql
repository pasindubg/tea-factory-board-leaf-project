-- Immutable Broker Invoice creation date. The source created_at value is
-- database-generated; converting it to the factory calendar keeps the saved
-- date independent from browser clocks and prevents manual writes.

ALTER TABLE "auction_sales"
  ADD COLUMN "created_date" date
  GENERATED ALWAYS AS (
    ("created_at" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Colombo')::date
  ) STORED NOT NULL;
