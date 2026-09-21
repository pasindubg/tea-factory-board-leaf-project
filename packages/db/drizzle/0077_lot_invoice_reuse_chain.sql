-- 0077 — a carried-forward lot's source is identified by the invoice it carries,
-- not by a lot_invoices row: a lot opened from the Re-prints page (the head of
-- the chain) never gets one, which blocked every row carried forward from it.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_lot_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  source_lot_id uuid;
  new_sale_key text;
BEGIN
  SELECT COALESCE(al.reprint_source_lot_id, al.skipped_source_lot_id),
         public.auction_sale_no_key(COALESCE(al.final_sale_no, al.provisional_sale_no))
    INTO source_lot_id, new_sale_key
  FROM public.auction_lots al
  WHERE al.id = NEW.lot_id;

  IF EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    JOIN public.auction_lots al ON al.id = li.lot_id
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id <> NEW.lot_id
      AND public.auction_sale_no_key(COALESCE(al.final_sale_no, al.provisional_sale_no))
          IS NOT DISTINCT FROM new_sale_key
  ) THEN
    RAISE EXCEPTION 'Invoice number % is already attached to another lot in the same sale.', NEW.invoice_no;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lot_invoices li
    WHERE li.factory_id = NEW.factory_id
      AND li.invoice_no = NEW.invoice_no
      AND li.lot_id <> NEW.lot_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.auction_lots src
    WHERE src.id = source_lot_id
      AND (
        src.invoice_no = NEW.invoice_no
        OR EXISTS (
          SELECT 1
          FROM public.lot_invoices li
          WHERE li.lot_id = src.id
            AND li.invoice_no = NEW.invoice_no
        )
      )
  ) THEN
    RAISE EXCEPTION 'Invoice number % can only be reused by a lot carried forward from an earlier lot of the same invoice.', NEW.invoice_no;
  END IF;

  RETURN NEW;
END;
$$;
