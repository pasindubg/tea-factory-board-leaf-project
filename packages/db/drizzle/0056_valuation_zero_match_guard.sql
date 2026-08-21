-- A valuation whose invoices belong to another sale used to "confirm" with 0
-- matches: the import was marked confirmed and no lot moved, which reads as
-- success. Refuse it instead, so the transaction rolls back and the operator
-- is told which sale the report is actually for.
CREATE OR REPLACE FUNCTION public.confirm_auction_valuation(
  p_import_id uuid,
  p_broker_invoice_id uuid,
  p_sale_no text,
  p_parsed jsonb
)
RETURNS TABLE(matched_count integer, not_valued_count integer, reassigned_count integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_factory_id uuid := public.current_factory_id();
  v_broker_id uuid;
  v_invoice_no text;
  v_line jsonb;
  v_lot_id uuid;
  v_previous_sale_no text;
  v_matched_ids uuid[] := ARRAY[]::uuid[];
  v_matched integer := 0;
  v_matched_here integer := 0;
  v_not_valued integer := 0;
  v_reassigned integer := 0;
  v_lot_sale_no text;
  v_lines integer := jsonb_array_length(COALESCE(p_parsed->'lots', '[]'::jsonb));
BEGIN
  SELECT broker_id, COALESCE(target_sale_no, sale_no)
    INTO v_broker_id, v_invoice_no
  FROM auction_sales
  WHERE id = p_broker_invoice_id
    AND factory_id = v_factory_id
  FOR UPDATE;

  IF v_broker_id IS NULL THEN
    RAISE EXCEPTION 'Broker Invoice not found.';
  END IF;

  PERFORM 1
  FROM doc_imports
  WHERE id = p_import_id
    AND factory_id = v_factory_id
    AND doc_type = 'valuation'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Valuation import not found.';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(COALESCE(p_parsed->'lots', '[]'::jsonb))
  LOOP
    v_lot_id := NULL;
    v_previous_sale_no := NULL;

    SELECT lot.id,
           COALESCE(lot.final_sale_no, lot.provisional_sale_no),
           COALESCE(lot.final_sale_no, lot.provisional_sale_no, invoice.target_sale_no, invoice.sale_no)
      INTO v_lot_id, v_previous_sale_no, v_lot_sale_no
    FROM auction_lots AS lot
    JOIN auction_sales AS invoice ON invoice.id = lot.sale_id
    WHERE lot.factory_id = v_factory_id
      AND invoice.broker_id = v_broker_id
      AND lot.state <> 'sold'
      AND lot.shutout = false
      AND public.auction_invoice_match_key(v_line->>'invoiceNo') <> ''
      AND (
        public.auction_invoice_match_key(lot.invoice_no) = public.auction_invoice_match_key(v_line->>'invoiceNo')
        OR EXISTS (
          SELECT 1 FROM lot_invoices AS li
          WHERE li.lot_id = lot.id
            AND public.auction_invoice_match_key(li.invoice_no) = public.auction_invoice_match_key(v_line->>'invoiceNo')
        )
      )
    ORDER BY
      (public.auction_sale_no_key(COALESCE(lot.final_sale_no, lot.provisional_sale_no)) = public.auction_sale_no_key(p_sale_no)) DESC,
      lot.not_valued DESC,
      lot.created_at DESC
    LIMIT 1
    FOR UPDATE OF lot;

    IF v_lot_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_previous_sale_no IS DISTINCT FROM p_sale_no THEN
      v_reassigned := v_reassigned + 1;
    END IF;

    UPDATE auction_lots
    SET final_sale_no = p_sale_no,
        state = 'valued',
        not_valued = false
    WHERE id = v_lot_id;

    INSERT INTO valuations (
      factory_id, lot_id, price_min, price_max, projected_proceeds, tasting_note
    ) VALUES (
      v_factory_id,
      v_lot_id,
      NULLIF(v_line->>'priceMin', '')::numeric,
      NULLIF(v_line->>'priceMax', '')::numeric,
      NULLIF(v_line->>'projectedProceeds', '')::numeric,
      NULLIF(v_line->>'tastingNote', '')
    )
    ON CONFLICT (lot_id) DO UPDATE SET
      price_min = EXCLUDED.price_min,
      price_max = EXCLUDED.price_max,
      projected_proceeds = EXCLUDED.projected_proceeds,
      tasting_note = EXCLUDED.tasting_note;

    IF public.auction_sale_no_key(v_lot_sale_no) = public.auction_sale_no_key(v_invoice_no) THEN
      v_matched_here := v_matched_here + 1;
    END IF;

    v_matched_ids := array_append(v_matched_ids, v_lot_id);
    v_matched := v_matched + 1;
  END LOOP;

  -- Matching is broker-wide on purpose (a Not Valued invoice can reappear in a
  -- later sale), so a stray hit on some other sale's lot is not evidence the
  -- report belongs here. Confirming needs at least one lot of THIS sale.
  IF v_matched_here = 0 THEN
    RAISE EXCEPTION
      'None of the % invoice(s) in this report match a lot in sale %. The report itself is for sale %, and % of its invoices matched lots in other sales. Upload this broker''s valuation for sale %, or reject this document.',
      v_lines,
      COALESCE(NULLIF(v_invoice_no, ''), '—'),
      COALESCE(NULLIF(p_sale_no, ''), '—'),
      v_matched,
      COALESCE(NULLIF(v_invoice_no, ''), '—');
  END IF;

  UPDATE auction_lots AS lot
  SET not_valued = true,
      final_sale_no = NULL
  FROM auction_sales AS invoice
  WHERE invoice.id = lot.sale_id
    AND lot.factory_id = v_factory_id
    AND invoice.broker_id = v_broker_id
    AND public.auction_sale_no_key(lot.provisional_sale_no) = public.auction_sale_no_key(p_sale_no)
    AND lot.final_sale_no IS NULL
    AND lot.state IN ('invoiced', 'acknowledged')
    AND NOT (lot.id = ANY(v_matched_ids));
  GET DIAGNOSTICS v_not_valued = ROW_COUNT;

  UPDATE doc_imports
  SET parsed_json = p_parsed,
      status = 'confirmed',
      confirmed_at = now()
  WHERE id = p_import_id
    AND factory_id = v_factory_id;

  RETURN QUERY SELECT v_matched, v_not_valued, v_reassigned;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.confirm_auction_valuation(uuid, uuid, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.confirm_auction_valuation(uuid, uuid, text, jsonb) TO authenticated;--> statement-breakpoint

ALTER TABLE "auction_lots" ADD COLUMN "reprint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD COLUMN "reprint_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- `unsold` now means one thing only: the sellers contract for the sale this lot
-- is in reported it NOT SOLD. A lot re-offered in a later sale is a re-print,
-- which is a different fact, so split the two.
UPDATE "auction_lots" SET "reprint" = true
 WHERE "unsold" = true OR "reprint_source_lot_id" IS NOT NULL;--> statement-breakpoint

UPDATE "auction_lots" AS l SET "unsold" = false
  FROM "auction_sales" AS s
 WHERE s.id = l.sale_id
   AND l.unsold = true
   AND NOT EXISTS (
     SELECT 1
     FROM doc_imports AS d
     JOIN auction_sales AS s2 ON s2.id = d.sale_id
     WHERE d.doc_type = 'contract'
       AND d.status = 'confirmed'
       AND d.factory_id = l.factory_id
       AND s2.broker_id = s.broker_id
       AND public.auction_sale_no_key(COALESCE(s2.target_sale_no, s2.sale_no))
         = public.auction_sale_no_key(COALESCE(s.target_sale_no, s.sale_no))
   );
