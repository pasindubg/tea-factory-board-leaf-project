CREATE UNIQUE INDEX "uq_users_factory_id" ON "users" USING btree ("factory_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_drivers_factory_user" ON "drivers" USING btree ("factory_id","user_id") WHERE "drivers"."user_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "fk_drivers_user_factory" FOREIGN KEY ("factory_id","user_id") REFERENCES "public"."users"("factory_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
-- A driver record links to an existing active Driver user. Tenant identity
-- remains enforced by the composite foreign key even for direct API writes.
CREATE FUNCTION public.guard_driver_account() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = NEW.user_id
      AND u.factory_id = NEW.factory_id AND u.role = 'driver' AND u.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'User ID must be an active Driver user in this factory.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_driver_account() FROM PUBLIC;
CREATE TRIGGER driver_account_guard BEFORE INSERT OR UPDATE OF user_id, factory_id
  ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.guard_driver_account();
--> statement-breakpoint
-- This is an invoker lookup: the driver/assignment RLS below still applies.
CREATE FUNCTION public.assigned_driver_line_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT ld.line_id FROM public.line_drivers ld
  JOIN public.drivers d ON d.id = ld.driver_id AND d.factory_id = ld.factory_id
  JOIN public.users u ON u.id = d.user_id AND u.factory_id = d.factory_id
  WHERE ld.factory_id = public.current_factory_id()
    AND u.id = auth.uid() AND u.role = 'driver' AND u.active IS TRUE AND d.active IS TRUE
$$;
REVOKE ALL ON FUNCTION public.assigned_driver_line_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assigned_driver_line_ids() TO authenticated;
--> statement-breakpoint
CREATE POLICY driver_own_user ON public.users AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'driver' OR id = auth.uid());
CREATE POLICY driver_own_record ON public.drivers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'driver' OR (user_id = auth.uid() AND active));
CREATE POLICY driver_own_assignments ON public.line_drivers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'driver' OR driver_id IN (
    SELECT id FROM public.drivers WHERE user_id = auth.uid() AND active
  ));
CREATE POLICY driver_assigned_lines ON public.lines AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.current_user_role() <> 'driver' OR (active AND id IN (SELECT public.assigned_driver_line_ids())));
--> statement-breakpoint
-- Mobile users cannot grant themselves another role, change the registry or
-- assign themselves extra lines through direct Data API calls.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drivers', 'line_drivers', 'lines'] LOOP
    EXECUTE format('CREATE POLICY driver_no_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.current_user_role() <> ''driver'')', t);
    EXECUTE format('CREATE POLICY driver_no_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.current_user_role() <> ''driver'') WITH CHECK (public.current_user_role() <> ''driver'')', t);
    EXECUTE format('CREATE POLICY driver_no_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.current_user_role() <> ''driver'')', t);
  END LOOP;
END $$;
CREATE POLICY field_no_user_insert ON public.users AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() NOT IN ('driver', 'field_officer'));
CREATE POLICY field_no_user_update ON public.users AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.current_user_role() NOT IN ('driver', 'field_officer'))
  WITH CHECK (public.current_user_role() NOT IN ('driver', 'field_officer'));
CREATE POLICY field_no_user_delete ON public.users AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.current_user_role() NOT IN ('driver', 'field_officer'));
--> statement-breakpoint
CREATE POLICY driver_assigned_suppliers ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_user_role() <> 'driver' OR line_id IN (SELECT id FROM public.lines WHERE active))
  WITH CHECK (public.current_user_role() <> 'driver' OR line_id IN (SELECT id FROM public.lines WHERE active));
CREATE POLICY driver_assigned_requests ON public.supplier_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.current_user_role() <> 'driver' OR supplier_id IN (SELECT id FROM public.suppliers))
  WITH CHECK (public.current_user_role() <> 'driver' OR supplier_id IN (SELECT id FROM public.suppliers));
