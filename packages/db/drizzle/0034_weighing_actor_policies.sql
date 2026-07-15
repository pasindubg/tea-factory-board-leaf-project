-- Weighings are written directly by the signed-in Expo client. Factory-only
-- RLS is not sufficient there: a modified collector client could otherwise
-- attribute a row to a different collector or supplier in the same tenant.

CREATE OR REPLACE FUNCTION public.current_collector_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.collectors
  WHERE user_id = auth.uid()
    AND factory_id = public.current_factory_id()
  LIMIT 1
$$;
--> statement-breakpoint

DROP POLICY IF EXISTS "factory_isolation" ON "weighings";
--> statement-breakpoint

CREATE POLICY "weighings_read_by_role" ON "weighings"
  FOR SELECT TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND (
      public.current_user_role() IN ('owner', 'manager', 'supervisor', 'accountant')
      OR (
        public.current_user_role() = 'collector'
        AND collector_id = public.current_collector_id()
      )
    )
  );
--> statement-breakpoint

CREATE POLICY "weighings_insert_by_role" ON "weighings"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND EXISTS (
      SELECT 1
      FROM public.suppliers supplier
      WHERE supplier.id = supplier_id
        AND supplier.factory_id = public.current_factory_id()
        AND supplier.active IS DISTINCT FROM false
    )
    AND EXISTS (
      SELECT 1
      FROM public.collectors collector
      WHERE collector.id = collector_id
        AND collector.factory_id = public.current_factory_id()
        AND collector.active IS DISTINCT FROM false
    )
    AND (
      public.current_user_role() IN ('owner', 'manager', 'supervisor', 'accountant')
      OR (
        public.current_user_role() = 'collector'
        AND collector_id = public.current_collector_id()
      )
    )
  );
--> statement-breakpoint

-- No UPDATE or DELETE policy is intentional. Weighings are immutable source
-- records; corrections must be introduced as an audited ERP workflow rather
-- than by changing history from a field client.

