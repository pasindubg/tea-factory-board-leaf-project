-- Multi-tenant row level security: every authenticated user is confined to
-- their own factory's rows. The service role (server-side) bypasses RLS.

-- security definer so the lookup itself is not subject to RLS — avoids
-- infinite recursion when the users policy consults the users table.
CREATE OR REPLACE FUNCTION public.current_factory_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT factory_id FROM public.users WHERE id = auth.uid()
$$;
--> statement-breakpoint
ALTER TABLE "factories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collectors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_rates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "lots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "weighings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "factories" FOR ALL TO authenticated
  USING (id = public.current_factory_id())
  WITH CHECK (id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "users" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "collectors" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "suppliers" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "price_rates" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "lots" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "weighings" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factory_isolation" ON "payments" FOR ALL TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (factory_id = public.current_factory_id());
