-- Broker Invoices are prefixed "BI" (e.g. "BI0010") so their sale_no reads
-- unambiguously as an invoice id everywhere it's shown. sale_no stays a plain
-- text column; saleNoKey()/saleNoMatches() already normalize by trailing digit
-- run, so the prefix is transparent to existing matching logic.
UPDATE "auction_sales"
SET "sale_no" = 'BI' || "sale_no"
WHERE "sale_no" !~ '^BI';
