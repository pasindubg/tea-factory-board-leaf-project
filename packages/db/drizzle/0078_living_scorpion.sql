ALTER TABLE "auction_bundled_dispatches" ADD COLUMN "bag_check_mode" text DEFAULT 'controlled' NOT NULL;--> statement-breakpoint
UPDATE "auction_bundled_dispatches" SET "bag_check_mode" = 'legacy';--> statement-breakpoint
ALTER TABLE "auction_bundled_dispatches" ADD CONSTRAINT "auction_bundled_dispatches_bag_check_mode_check" CHECK ("bag_check_mode" IN ('legacy', 'controlled'));--> statement-breakpoint
CREATE TABLE "auction_dispatch_lot_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"expected_bags" integer NOT NULL,
	"target_grams" integer NOT NULL,
	"under_tolerance_grams" integer NOT NULL,
	"over_tolerance_grams" integer NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "dispatch_check_values" CHECK ("auction_dispatch_lot_checks"."expected_bags" > 0 AND "auction_dispatch_lot_checks"."target_grams" > 0 AND "auction_dispatch_lot_checks"."under_tolerance_grams" >= 0 AND "auction_dispatch_lot_checks"."under_tolerance_grams" < "auction_dispatch_lot_checks"."target_grams" AND "auction_dispatch_lot_checks"."over_tolerance_grams" >= 0 AND "auction_dispatch_lot_checks"."policy_version" > 0)
);--> statement-breakpoint
CREATE TABLE "auction_dispatch_bags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factory_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"bag_number" integer NOT NULL,
	"measured_grams" integer,
	"device_id" text,
	"load_id" uuid,
	"reading_id" uuid,
	"request_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp,
	CONSTRAINT "dispatch_bag_number_positive" CHECK ("auction_dispatch_bags"."bag_number" > 0),
	CONSTRAINT "dispatch_bag_confirmation_complete" CHECK (("auction_dispatch_bags"."confirmed_at" IS NULL AND "auction_dispatch_bags"."measured_grams" IS NULL AND "auction_dispatch_bags"."device_id" IS NULL AND "auction_dispatch_bags"."load_id" IS NULL AND "auction_dispatch_bags"."reading_id" IS NULL AND "auction_dispatch_bags"."request_id" IS NULL AND "auction_dispatch_bags"."confirmed_by" IS NULL) OR ("auction_dispatch_bags"."confirmed_at" IS NOT NULL AND "auction_dispatch_bags"."measured_grams" > 0 AND "auction_dispatch_bags"."device_id" IS NOT NULL AND "auction_dispatch_bags"."load_id" IS NOT NULL AND "auction_dispatch_bags"."reading_id" IS NOT NULL AND "auction_dispatch_bags"."request_id" IS NOT NULL AND "auction_dispatch_bags"."confirmed_by" IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_bundled_dispatches_factory_id" ON "auction_bundled_dispatches" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_lots_factory_id" ON "auction_lots" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_checks_factory_id" ON "auction_dispatch_lot_checks" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_checks_dispatch_lot" ON "auction_dispatch_lot_checks" USING btree ("factory_id","dispatch_id","lot_id");--> statement-breakpoint
CREATE INDEX "idx_auction_dispatch_checks_factory_dispatch" ON "auction_dispatch_lot_checks" USING btree ("factory_id","dispatch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_bags_factory_id" ON "auction_dispatch_bags" USING btree ("factory_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_bags_check_number" ON "auction_dispatch_bags" USING btree ("factory_id","check_id","bag_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_bags_request" ON "auction_dispatch_bags" USING btree ("factory_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_auction_dispatch_bags_load" ON "auction_dispatch_bags" USING btree ("factory_id","dispatch_id","device_id","load_id");--> statement-breakpoint
CREATE INDEX "idx_auction_dispatch_bags_factory_check" ON "auction_dispatch_bags" USING btree ("factory_id","check_id");--> statement-breakpoint
ALTER TABLE "auction_dispatch_lot_checks" ADD CONSTRAINT "auction_dispatch_lot_checks_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_lot_checks" ADD CONSTRAINT "fk_dispatch_checks_dispatch" FOREIGN KEY ("factory_id","dispatch_id") REFERENCES "public"."auction_bundled_dispatches"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_lot_checks" ADD CONSTRAINT "fk_dispatch_checks_lot" FOREIGN KEY ("factory_id","lot_id") REFERENCES "public"."auction_lots"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bags" ADD CONSTRAINT "auction_dispatch_bags_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bags" ADD CONSTRAINT "auction_dispatch_bags_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bags" ADD CONSTRAINT "fk_dispatch_bags_check" FOREIGN KEY ("factory_id","check_id") REFERENCES "public"."auction_dispatch_lot_checks"("factory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_dispatch_bags" ADD CONSTRAINT "fk_dispatch_bags_dispatch" FOREIGN KEY ("factory_id","dispatch_id") REFERENCES "public"."auction_bundled_dispatches"("factory_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE public.auction_dispatch_lot_checks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.auction_dispatch_bags ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY factory_isolation_read ON public.auction_dispatch_lot_checks
  FOR SELECT TO authenticated USING (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY factory_isolation_read ON public.auction_dispatch_bags
  FOR SELECT TO authenticated USING (factory_id = public.current_factory_id());--> statement-breakpoint
CREATE POLICY factory_isolation_insert ON public.auction_dispatch_lot_checks
  FOR INSERT TO authenticated WITH CHECK (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on');--> statement-breakpoint
CREATE POLICY factory_isolation_update ON public.auction_dispatch_lot_checks
  FOR UPDATE TO authenticated USING (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on')
  WITH CHECK (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on');--> statement-breakpoint
CREATE POLICY factory_isolation_insert ON public.auction_dispatch_bags
  FOR INSERT TO authenticated WITH CHECK (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on');--> statement-breakpoint
CREATE POLICY factory_isolation_update ON public.auction_dispatch_bags
  FOR UPDATE TO authenticated USING (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on')
  WITH CHECK (factory_id = public.current_factory_id() AND current_setting('app.dispatch_bag_write', true) = 'on');--> statement-breakpoint

CREATE FUNCTION public.dispatch_bag_actor_can_update()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.factory_id = public.current_factory_id()
      AND u.active IS TRUE AND u.role IN ('owner', 'manager', 'accountant')
      AND (
        u.role = 'owner' OR u.access_role_id IS NULL OR EXISTS (
          SELECT 1 FROM public.role_page_permissions p
          WHERE p.role_id = u.access_role_id AND p.factory_id = u.factory_id
            AND p.page_key = 'auction-dispatch-lot-detail'
            AND p.can_view AND p.can_update
        )
      )
  )
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.dispatch_bag_actor_can_update() FROM PUBLIC, anon, anonymous;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dispatch_bag_actor_can_update() TO authenticated;--> statement-breakpoint

CREATE FUNCTION public.start_dispatch_bag_checks(p_dispatch_id uuid, p_under_grams integer, p_over_grams integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_dispatch public.auction_bundled_dispatches%ROWTYPE;
  v_count integer;
BEGIN
  IF NOT public.dispatch_bag_actor_can_update() THEN RAISE EXCEPTION 'Bag-check permission denied.'; END IF;
  SELECT * INTO v_dispatch FROM public.auction_bundled_dispatches
    WHERE id = p_dispatch_id AND factory_id = public.current_factory_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch not found.'; END IF;
  IF v_dispatch.bag_check_mode <> 'controlled' OR v_dispatch.status <> 'invoiced' OR v_dispatch.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an invoiced, controlled, not-yet-dispatched load can start bag checks.';
  END IF;
  IF p_under_grams IS NULL OR p_over_grams IS NULL OR p_under_grams < 0 OR p_over_grams < 0 THEN
    RAISE EXCEPTION 'Set valid whole-gram tolerances.';
  END IF;
  SELECT count(*) INTO v_count FROM public.auction_dispatch_lot_checks
    WHERE factory_id = v_dispatch.factory_id AND dispatch_id = p_dispatch_id;
  IF v_count > 0 THEN RETURN v_count; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auction_sales s WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id AND s.sale_kind = 'dispatch')
    OR EXISTS (SELECT 1 FROM public.auction_sales s WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id AND s.sale_kind = 'dispatch' AND s.status <> 'invoiced') THEN
    RAISE EXCEPTION 'Confirm every dispatch invoice before weighing.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.auction_lots l JOIN public.auction_sales s ON s.id = l.sale_id
    WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id
      AND s.sale_kind = 'dispatch' AND l.reprint_source_lot_id IS NULL AND l.skipped_source_lot_id IS NULL
  ) THEN RAISE EXCEPTION 'This dispatch has no physical lots.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.auction_lots l JOIN public.auction_sales s ON s.id = l.sale_id
    WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id
      AND s.sale_kind = 'dispatch' AND l.reprint_source_lot_id IS NULL AND l.skipped_source_lot_id IS NULL
      AND (l.bags IS NULL OR l.bags <= 0 OR l.kg_per_bag IS NULL OR l.kg_per_bag <= 0
        OR l.kg_per_bag * 1000 > 2147483647 OR p_under_grams >= l.kg_per_bag * 1000
        OR l.kg_per_bag * 1000 + p_over_grams > 2147483647)
  ) THEN RAISE EXCEPTION 'Every physical lot needs a positive bag count and a valid kg per bag target/tolerance.'; END IF;

  PERFORM set_config('app.dispatch_bag_write', 'on', true);
  INSERT INTO public.auction_dispatch_lot_checks
    (factory_id, dispatch_id, lot_id, grade, expected_bags, target_grams, under_tolerance_grams, over_tolerance_grams)
  SELECT v_dispatch.factory_id, p_dispatch_id, l.id, l.grade, l.bags, (l.kg_per_bag * 1000)::integer, p_under_grams, p_over_grams
    FROM public.auction_lots l JOIN public.auction_sales s ON s.id = l.sale_id
    WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id
      AND s.sale_kind = 'dispatch' AND l.reprint_source_lot_id IS NULL AND l.skipped_source_lot_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.auction_dispatch_bags (factory_id, dispatch_id, check_id, bag_number)
  SELECT c.factory_id, c.dispatch_id, c.id, n
    FROM public.auction_dispatch_lot_checks c CROSS JOIN LATERAL generate_series(1, c.expected_bags) n
    WHERE c.factory_id = v_dispatch.factory_id AND c.dispatch_id = p_dispatch_id;
  RETURN v_count;
END $$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.start_dispatch_bag_checks(uuid, integer, integer) FROM PUBLIC, anon, anonymous;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_dispatch_bag_checks(uuid, integer, integer) TO authenticated;--> statement-breakpoint

CREATE FUNCTION public.confirm_dispatch_bag(
  p_dispatch_id uuid, p_lot_id uuid, p_bag_number integer, p_measured_grams integer,
  p_device_id text, p_load_id uuid, p_reading_id uuid, p_request_id uuid,
  p_source text, p_stable boolean, p_received_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_dispatch public.auction_bundled_dispatches%ROWTYPE;
  v_check public.auction_dispatch_lot_checks%ROWTYPE;
  v_bag public.auction_dispatch_bags%ROWTYPE;
  v_lot_done boolean;
  v_dispatch_done boolean;
  v_count integer;
BEGIN
  IF NOT public.dispatch_bag_actor_can_update() THEN RAISE EXCEPTION 'Bag-check permission denied.'; END IF;
  SELECT * INTO v_dispatch FROM public.auction_bundled_dispatches
    WHERE id = p_dispatch_id AND factory_id = public.current_factory_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch not found.'; END IF;
  SELECT * INTO v_check FROM public.auction_dispatch_lot_checks
    WHERE factory_id = v_dispatch.factory_id AND dispatch_id = p_dispatch_id AND lot_id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Physical lot is not in this dispatch manifest.'; END IF;
  SELECT * INTO v_bag FROM public.auction_dispatch_bags
    WHERE factory_id = v_dispatch.factory_id AND dispatch_id = p_dispatch_id
      AND check_id = v_check.id AND bag_number = p_bag_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bag not found.'; END IF;
  IF v_bag.confirmed_at IS NOT NULL THEN
    IF v_bag.request_id = p_request_id AND v_bag.measured_grams = p_measured_grams
      AND v_bag.device_id = p_device_id AND v_bag.load_id = p_load_id AND v_bag.reading_id = p_reading_id THEN
      RETURN jsonb_build_object('bagNumber', p_bag_number, 'lotComplete', v_check.completed_at IS NOT NULL, 'dispatchComplete', v_dispatch.dispatched_at IS NOT NULL);
    END IF;
    RAISE EXCEPTION 'Bag already confirmed with a different reading.';
  END IF;
  IF v_dispatch.bag_check_mode <> 'controlled' OR v_dispatch.dispatched_at IS NOT NULL OR v_dispatch.status <> 'invoiced' THEN
    RAISE EXCEPTION 'This dispatch is not accepting bag checks.';
  END IF;
  IF p_request_id IS NULL OR p_load_id IS NULL OR p_reading_id IS NULL OR p_device_id IS NULL
    OR length(trim(p_device_id)) = 0 OR length(p_device_id) > 200 OR p_measured_grams IS NULL
    OR p_source <> 'scale' OR p_stable IS DISTINCT FROM TRUE OR p_received_at IS NULL
    OR p_received_at > clock_timestamp() OR p_received_at < clock_timestamp() - interval '5 seconds' THEN
    RAISE EXCEPTION 'A fresh, stable, connected scale reading is required.';
  END IF;
  IF p_measured_grams < v_check.target_grams - v_check.under_tolerance_grams
    OR p_measured_grams > v_check.target_grams + v_check.over_tolerance_grams THEN
    RAISE EXCEPTION 'Bag weight is outside the permitted margin.';
  END IF;
  PERFORM set_config('app.dispatch_bag_write', 'on', true);
  UPDATE public.auction_dispatch_bags
    SET measured_grams = p_measured_grams, device_id = p_device_id, load_id = p_load_id,
      reading_id = p_reading_id, request_id = p_request_id, confirmed_by = auth.uid(), confirmed_at = now()
    WHERE id = v_bag.id AND factory_id = v_dispatch.factory_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'The bag confirmation could not be saved.'; END IF;
  IF EXISTS (SELECT 1 FROM public.auction_dispatch_bags b WHERE b.check_id = v_check.id AND b.factory_id = v_dispatch.factory_id AND b.confirmed_at IS NULL) THEN
    v_lot_done := false;
  ELSE
    UPDATE public.auction_dispatch_lot_checks SET completed_at = now()
      WHERE id = v_check.id AND factory_id = v_dispatch.factory_id;
    v_lot_done := true;
  END IF;
  SELECT count(*) INTO v_count FROM public.auction_dispatch_lot_checks c
    WHERE c.factory_id = v_dispatch.factory_id AND c.dispatch_id = p_dispatch_id;
  v_dispatch_done := v_count > 0 AND v_lot_done AND NOT EXISTS (
    SELECT 1 FROM public.auction_dispatch_lot_checks c
    WHERE c.factory_id = v_dispatch.factory_id AND c.dispatch_id = p_dispatch_id AND c.completed_at IS NULL
  ) AND v_count = (
    SELECT count(*) FROM public.auction_lots l JOIN public.auction_sales s ON s.id = l.sale_id
    WHERE s.bundled_dispatch_id = p_dispatch_id AND s.factory_id = v_dispatch.factory_id
      AND s.sale_kind = 'dispatch' AND l.reprint_source_lot_id IS NULL AND l.skipped_source_lot_id IS NULL
  );
  IF v_dispatch_done THEN
    UPDATE public.auction_bundled_dispatches SET dispatched_at = now(),
      status = CASE WHEN status IN ('received', 'catalogued') THEN status ELSE 'dispatched' END
      WHERE id = p_dispatch_id AND factory_id = v_dispatch.factory_id;
  END IF;
  RETURN jsonb_build_object('bagNumber', p_bag_number, 'lotComplete', v_lot_done, 'dispatchComplete', v_dispatch_done);
END $$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.confirm_dispatch_bag(uuid, uuid, integer, integer, text, uuid, uuid, uuid, text, boolean, timestamptz) FROM PUBLIC, anon, anonymous;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.confirm_dispatch_bag(uuid, uuid, integer, integer, text, uuid, uuid, uuid, text, boolean, timestamptz) TO authenticated;--> statement-breakpoint

CREATE FUNCTION public.guard_dispatch_bag_state() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.bag_check_mode IS DISTINCT FROM NEW.bag_check_mode THEN
    RAISE EXCEPTION 'The dispatch bag-check mode is locked.';
  END IF;
  IF OLD.bag_check_mode = 'controlled' AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    AND current_setting('app.dispatch_bag_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Complete every bag check before dispatching.';
  END IF;
  IF OLD.bag_check_mode = 'controlled' AND NEW.dispatched_at IS NULL
    AND NEW.status IN ('dispatched', 'received', 'catalogued') AND OLD.status NOT IN ('dispatched', 'received', 'catalogued')
    AND current_setting('app.dispatch_bag_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Complete every bag check before dispatching.';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER guard_dispatch_bag_state BEFORE UPDATE ON public.auction_bundled_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch_bag_state();--> statement-breakpoint

CREATE FUNCTION public.guard_confirmed_dispatch_bag() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'A confirmed bag is immutable.'; END IF;
  IF NEW.dispatch_id <> OLD.dispatch_id OR NEW.check_id <> OLD.check_id
    OR NEW.factory_id <> OLD.factory_id OR NEW.bag_number <> OLD.bag_number THEN
    RAISE EXCEPTION 'A numbered bag cannot move between lots.';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER guard_confirmed_dispatch_bag BEFORE UPDATE ON public.auction_dispatch_bags
  FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_dispatch_bag();--> statement-breakpoint

CREATE FUNCTION public.guard_dispatch_manifest_lot() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_dispatch uuid;
DECLARE v_old_sale uuid;
DECLARE v_new_sale uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_sale := OLD.sale_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_sale := NEW.sale_id; END IF;
  FOR v_dispatch IN
    SELECT DISTINCT d.id FROM public.auction_sales s
      JOIN public.auction_bundled_dispatches d ON d.id = s.bundled_dispatch_id
      WHERE s.id IN (v_old_sale, v_new_sale) AND d.bag_check_mode = 'controlled'
        AND d.dispatched_at IS NULL AND s.sale_kind = 'dispatch' ORDER BY d.id
  LOOP
    PERFORM 1 FROM public.auction_bundled_dispatches d WHERE d.id = v_dispatch FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.auction_dispatch_lot_checks c WHERE c.dispatch_id = v_dispatch) THEN
      IF TG_OP = 'INSERT' AND NEW.reprint_source_lot_id IS NULL AND NEW.skipped_source_lot_id IS NULL THEN
        RAISE EXCEPTION 'The physical lot manifest is already locked.';
      ELSIF TG_OP = 'DELETE' AND OLD.reprint_source_lot_id IS NULL AND OLD.skipped_source_lot_id IS NULL THEN
        RAISE EXCEPTION 'The physical lot manifest is already locked.';
      ELSIF TG_OP = 'UPDATE' AND OLD.reprint_source_lot_id IS NULL AND OLD.skipped_source_lot_id IS NULL
        AND (NEW.bags, NEW.kg_per_bag, NEW.grade, NEW.sale_id, NEW.reprint_source_lot_id, NEW.skipped_source_lot_id)
          IS DISTINCT FROM (OLD.bags, OLD.kg_per_bag, OLD.grade, OLD.sale_id, OLD.reprint_source_lot_id, OLD.skipped_source_lot_id) THEN
        RAISE EXCEPTION 'The physical lot manifest is already locked.';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;--> statement-breakpoint
CREATE TRIGGER guard_dispatch_manifest_lot BEFORE INSERT OR UPDATE OR DELETE ON public.auction_lots
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch_manifest_lot();--> statement-breakpoint

CREATE FUNCTION public.guard_dispatch_manifest_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_dispatch uuid;
DECLARE v_old_dispatch uuid;
DECLARE v_new_dispatch uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old_dispatch := OLD.bundled_dispatch_id; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_dispatch := NEW.bundled_dispatch_id; END IF;
  FOR v_dispatch IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      v_old_dispatch, v_new_dispatch
    ]) x WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM 1 FROM public.auction_bundled_dispatches d WHERE d.id = v_dispatch FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.auction_bundled_dispatches d
      WHERE d.id = v_dispatch AND d.bag_check_mode = 'controlled' AND d.dispatched_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.auction_dispatch_lot_checks c WHERE c.dispatch_id = v_dispatch)
      AND (TG_OP IN ('INSERT', 'DELETE') OR v_new_dispatch IS DISTINCT FROM v_old_dispatch) THEN
      RAISE EXCEPTION 'The dispatch invoice manifest is already locked.';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;--> statement-breakpoint
CREATE TRIGGER guard_dispatch_manifest_invoice BEFORE INSERT OR UPDATE OR DELETE ON public.auction_sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_dispatch_manifest_invoice();--> statement-breakpoint

REVOKE ALL ON TABLE public.auction_dispatch_lot_checks, public.auction_dispatch_bags FROM anon, anonymous;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.auction_dispatch_lot_checks, public.auction_dispatch_bags TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.auction_dispatch_lot_checks, public.auction_dispatch_bags TO service_role;
