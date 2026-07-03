-- 0020 — New dispatch rows start as draft.
--
-- Dispatch rows are created when the factory records the auction sale number and
-- sale date. The row moves to catalogued only after at least one lot is
-- acknowledged from the broker acknowledgement PDF.

ALTER TABLE "auction_sales" ALTER COLUMN "status" SET DEFAULT 'draft';
