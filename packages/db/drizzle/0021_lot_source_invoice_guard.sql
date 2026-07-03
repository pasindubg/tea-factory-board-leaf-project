-- 0021 — track where auction lots came from and prevent future invoice reuse.

ALTER TABLE "auction_lots"
  ADD COLUMN IF NOT EXISTS "lot_source" text NOT NULL DEFAULT 'factory';

ALTER TABLE "auction_lots"
  DROP CONSTRAINT IF EXISTS "auction_lots_lot_source_check";
ALTER TABLE "auction_lots"
  ADD CONSTRAINT "auction_lots_lot_source_check"
  CHECK ("lot_source" IN ('factory', 'acknowledgement'));

CREATE OR REPLACE FUNCTION public.prevent_duplicate_lot_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id <> NEW.lot_id
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already attached to another dispatch lot.', NEW.invoice_no;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_lot_invoice ON "lot_invoices";
CREATE TRIGGER trg_prevent_duplicate_lot_invoice
BEFORE INSERT OR UPDATE OF invoice_no, factory_id, lot_id ON "lot_invoices"
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_lot_invoice();
