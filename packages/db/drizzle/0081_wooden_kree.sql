ALTER TABLE "auction_bundled_dispatches" ALTER COLUMN "bag_check_mode" SET DEFAULT 'legacy';--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_dispatch_bag_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_manifest_count integer;
  v_physical_count integer;
BEGIN
  IF OLD.bag_check_mode IS DISTINCT FROM NEW.bag_check_mode THEN
    IF OLD.bag_check_mode = 'legacy' AND NEW.bag_check_mode = 'controlled'
      AND OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NULL
      AND OLD.status IN ('draft', 'invoiced') AND NEW.status = OLD.status
      AND current_setting('app.dispatch_bag_enable', true) = 'on'
      AND NOT EXISTS (SELECT 1 FROM public.auction_dispatch_lot_checks c
        WHERE c.factory_id = OLD.factory_id AND c.dispatch_id = OLD.id) THEN
      RETURN NEW;
    END IF;
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
END $$;--> statement-breakpoint

CREATE FUNCTION public.enable_dispatch_bag_checks(p_dispatch_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_dispatch public.auction_bundled_dispatches%ROWTYPE;
BEGIN
  IF NOT public.dispatch_bag_actor_can_update() THEN RAISE EXCEPTION 'Bag-check permission denied.'; END IF;
  SELECT * INTO v_dispatch FROM public.auction_bundled_dispatches
    WHERE id = p_dispatch_id AND factory_id = public.current_factory_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch not found.'; END IF;
  IF v_dispatch.bag_check_mode = 'controlled' THEN RETURN true; END IF;
  IF v_dispatch.status NOT IN ('draft', 'invoiced') OR v_dispatch.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only a not-yet-dispatched load can enable bag checks.';
  END IF;
  PERFORM set_config('app.dispatch_bag_enable', 'on', true);
  UPDATE public.auction_bundled_dispatches SET bag_check_mode = 'controlled'
    WHERE factory_id = v_dispatch.factory_id AND id = p_dispatch_id;
  RETURN true;
END $$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.enable_dispatch_bag_checks(uuid) FROM PUBLIC, anon, anonymous;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.enable_dispatch_bag_checks(uuid) TO authenticated;
