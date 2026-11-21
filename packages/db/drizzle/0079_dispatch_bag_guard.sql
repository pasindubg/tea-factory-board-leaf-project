CREATE OR REPLACE FUNCTION public.guard_dispatch_bag_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_manifest_count integer;
  v_physical_count integer;
BEGIN
  IF OLD.bag_check_mode IS DISTINCT FROM NEW.bag_check_mode THEN
    RAISE EXCEPTION 'The dispatch bag-check mode is locked.';
  END IF;
  IF OLD.bag_check_mode <> 'controlled' THEN RETURN NEW; END IF;

  IF NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    OR (NEW.status IN ('dispatched', 'received', 'catalogued')
      AND OLD.status NOT IN ('dispatched', 'received', 'catalogued')) THEN
    IF current_setting('app.dispatch_bag_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Complete every bag check before dispatching.';
    END IF;
    SELECT count(*) INTO v_manifest_count FROM public.auction_dispatch_lot_checks c
      WHERE c.factory_id = NEW.factory_id AND c.dispatch_id = NEW.id;
    SELECT count(*) INTO v_physical_count FROM public.auction_lots l
      JOIN public.auction_sales s ON s.id = l.sale_id
      WHERE s.factory_id = NEW.factory_id AND s.bundled_dispatch_id = NEW.id
        AND s.sale_kind = 'dispatch' AND l.reprint_source_lot_id IS NULL
        AND l.skipped_source_lot_id IS NULL;
    IF v_manifest_count = 0 OR v_manifest_count <> v_physical_count OR EXISTS (
      SELECT 1 FROM public.auction_dispatch_lot_checks c
      WHERE c.factory_id = NEW.factory_id AND c.dispatch_id = NEW.id
        AND (c.completed_at IS NULL OR c.expected_bags <> (
          SELECT count(*) FROM public.auction_dispatch_bags b
          WHERE b.factory_id = c.factory_id AND b.check_id = c.id
            AND b.confirmed_at IS NOT NULL
        ))
    ) THEN
      RAISE EXCEPTION 'Complete every bag check before dispatching.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
