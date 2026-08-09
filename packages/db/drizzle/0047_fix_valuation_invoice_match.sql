-- The valuation confirm RPC matched invoice numbers with exact string
-- equality, but a broker's valuation report only ever prints the bare
-- sequence ("0003") while the factory stores an index-cycle-prefixed invoice
-- number ("26I01-0003"). Every line failed to match as a result — this
-- mirrors the JS invoiceMatchKey() helper (packages/api/src/auction/invoice-key.ts)
-- so both sides normalize the same way before comparing.
CREATE OR REPLACE FUNCTION public.auction_invoice_match_key(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN seq = '' THEN ''
    WHEN seq ~ '[0-9]+$' THEN
      COALESCE(NULLIF(ltrim(substring(seq from '([0-9]+)$'), '0'), ''), '0')
    ELSE upper(trim(seq))
  END
  FROM (
    SELECT COALESCE(substring(COALESCE(p_value, '') from '.*-(.+)$'), COALESCE(p_value, '')) AS seq
  ) AS t;
$$;

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
  v_line jsonb;
  v_lot_id uuid;
  v_previous_sale_no text;
  v_matched_ids uuid[] := ARRAY[]::uuid[];
  v_matched integer := 0;
  v_not_valued integer := 0;
  v_reassigned integer := 0;
BEGIN
  SELECT broker_id INTO v_broker_id
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

    SELECT lot.id, COALESCE(lot.final_sale_no, lot.provisional_sale_no)
      INTO v_lot_id, v_previous_sale_no
    FROM auction_lots AS lot
    JOIN auction_sales AS invoice ON invoice.id = lot.sale_id
    WHERE lot.factory_id = v_factory_id
      AND invoice.broker_id = v_broker_id
      AND lot.state NOT IN ('sold', 'settled', 're-print', 'shutout')
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
      (lot.state = 'not-valued') DESC,
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
        state = 'valued'
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

    v_matched_ids := array_append(v_matched_ids, v_lot_id);
    v_matched := v_matched + 1;
  END LOOP;

  UPDATE auction_lots AS lot
  SET state = 'not-valued',
      final_sale_no = NULL
  FROM auction_sales AS invoice
  WHERE invoice.id = lot.sale_id
    AND lot.factory_id = v_factory_id
    AND invoice.broker_id = v_broker_id
    AND public.auction_sale_no_key(lot.provisional_sale_no) = public.auction_sale_no_key(p_sale_no)
    AND lot.final_sale_no IS NULL
    AND lot.state IN ('invoiced', 'acknowledged', 'pending', 'not-valued')
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

REVOKE ALL ON FUNCTION public.confirm_auction_valuation(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_auction_valuation(uuid, uuid, text, jsonb) TO authenticated;
