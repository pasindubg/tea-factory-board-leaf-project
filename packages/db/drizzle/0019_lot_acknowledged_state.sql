-- 0019 — Lot lifecycle wording: invoiced → acknowledged.
--
-- Factory-created lots start as invoiced. A broker acknowledgement confirms the
-- lot and assigns the broker lot number, so the persisted state becomes
-- acknowledged. Older dispatch-first rows are normalized here.

ALTER TABLE "auction_lots" ALTER COLUMN "state" SET DEFAULT 'invoiced';
--> statement-breakpoint
UPDATE "auction_lots" SET "state" = 'invoiced' WHERE "state" = 'dispatched';
--> statement-breakpoint
UPDATE "auction_lots" SET "state" = 'acknowledged' WHERE "state" = 'catalogued';
--> statement-breakpoint
UPDATE "auction_lots" SET "state" = 'acknowledged' WHERE "state" = 'pending' AND "lot_no" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "lot_invoices" ("factory_id","lot_id","invoice_no")
  SELECT l.factory_id, l.id, l.invoice_no
  FROM "auction_lots" l
  WHERE NOT EXISTS (
    SELECT 1
    FROM "lot_invoices" li
    WHERE li.lot_id = l.id
      AND li.invoice_no = l.invoice_no
  )
  ON CONFLICT DO NOTHING;
