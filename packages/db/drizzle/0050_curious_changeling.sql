-- 0050 — physical dispatches get the same server-side created date that
-- broker invoices already carry.
--
-- The Dispatch Details list could not offer "Created date" as a search field
-- because the table had only a `created_at` timestamp. Deriving the date per
-- row after the query would make it unfilterable in the database; a generated
-- column keeps it a real date the list can filter with `equals`, exactly as
-- auction_sales.created_date does.
--
-- Healing by construction: a GENERATED ALWAYS ... STORED column is computed
-- for every existing row when it is added, so there is no backfill to run and
-- no value that can be wrong. IF NOT EXISTS makes re-running harmless.

ALTER TABLE "auction_bundled_dispatches"
  ADD COLUMN IF NOT EXISTS "created_date" date
  GENERATED ALWAYS AS (("created_at" at time zone 'UTC' at time zone 'Asia/Colombo')::date) STORED NOT NULL;
