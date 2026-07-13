-- 0026 — broker invoices replace dispatches as the parent auction record.
--
-- The physical dispatch date remains for operational history, but confirmation
-- of the parent record now means the broker invoice is issued. Existing GRN
-- records represent previously confirmed dispatches and are migrated into the
-- new invoiced state.

UPDATE "auction_sales" SET "status" = 'invoiced' WHERE "status" = 'grn';
