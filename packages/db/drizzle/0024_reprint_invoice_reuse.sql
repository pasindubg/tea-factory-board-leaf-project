-- 0024 — allow an invoice number to reappear only after the prior lot is marked re-print.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_lot_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_lot_id uuid;
BEGIN
  SELECT al.reprint_source_lot_id
    INTO source_lot_id
  FROM public.auction_lots al
  WHERE al.id = NEW.lot_id;

  IF EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    JOIN public.auction_lots al ON al.id = li.lot_id
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id <> NEW.lot_id
      AND al.state <> 're-print'
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already attached to another active dispatch lot.', NEW.invoice_no;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id <> NEW.lot_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id = source_lot_id
  ) THEN
    RAISE EXCEPTION 'Invoice number % can only be reused from a lot already marked re-print.', NEW.invoice_no;
  END IF;

  RETURN NEW;
END;
$$;
