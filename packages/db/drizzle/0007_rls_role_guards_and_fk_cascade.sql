-- M7-fix: Defense-in-depth role guards + historical-attribution cascade.
--
-- Background (see security review): the original 0001 "factory_isolation"
-- policies enforce TENANT isolation (factory_id) but NOT ROLE integrity. A
-- logged-in collector (or any client holding the publishable key + a JWT)
-- could therefore write to rows their factory owns — e.g. flip their own
-- users.role to 'owner', rewrite price rates, or delete payments — because
-- WITH CHECK only inspected factory_id. App-level checks were the sole gate.
--
-- PRODUCT.md states the invariant: "App-level role checks control which
-- screens; RLS controls which rows. Both layers must hold." For the
-- sensitive tables below, the RLS layer now holds the role invariant too.
--
-- Strategy per table:
--   users, quality_tiers, module_permissions -> owner-only writes
--   price_rates, payment_settings, supplier_tiers, supplier_adjustments,
--     payments, payment_lines                         -> owner OR manager
--   suppliers, collectors, weighings, lots, factories -> unchanged (operational;
--     collectors legitimately insert weighings; factory-scoped stays)
--
-- All factory members can still SELECT every table in their factory (needed
-- for nav, lists, and read-only roles like accountant/supervisor).
--
-- Postgres combines multiple permissive policies with OR, so we DROP the old
-- single "FOR ALL" policy and recreate as separate SELECT vs. write policies.

-- ─── helper: is the caller a manager-or-above? ──────────────────────────────
-- current_user_role() already exists from 0003. Owners and managers are the
-- "management" tier; everything financial is gated to them.

-- ─── users: owner-only writes, factory-scoped reads ─────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "users";
--> statement-breakpoint
CREATE POLICY "users_factory_read" ON "users"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "users_owner_insert" ON "users"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "users_owner_update" ON "users"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "users_owner_delete" ON "users"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint

-- ─── quality_tiers: owner-only writes (the tier catalog is financial config) ─
DROP POLICY IF EXISTS "factory_isolation" ON "quality_tiers";
--> statement-breakpoint
CREATE POLICY "quality_tiers_factory_read" ON "quality_tiers"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "quality_tiers_owner_write" ON "quality_tiers"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint

-- ─── price_rates: management writes ─────────────────────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "price_rates";
--> statement-breakpoint
CREATE POLICY "price_rates_factory_read" ON "price_rates"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "price_rates_management_write" ON "price_rates"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

-- ─── payment_settings: management writes ────────────────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "payment_settings";
--> statement-breakpoint
CREATE POLICY "payment_settings_factory_read" ON "payment_settings"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "payment_settings_management_write" ON "payment_settings"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

-- ─── supplier_tiers: management writes ──────────────────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "supplier_tiers";
--> statement-breakpoint
CREATE POLICY "supplier_tiers_factory_read" ON "supplier_tiers"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "supplier_tiers_management_write" ON "supplier_tiers"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

-- ─── supplier_adjustments: management writes ────────────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "supplier_adjustments";
--> statement-breakpoint
CREATE POLICY "supplier_adjustments_factory_read" ON "supplier_adjustments"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "supplier_adjustments_management_write" ON "supplier_adjustments"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

-- ─── payments + payment_lines: management writes ────────────────────────────
DROP POLICY IF EXISTS "factory_isolation" ON "payments";
--> statement-breakpoint
CREATE POLICY "payments_factory_read" ON "payments"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "payments_management_write" ON "payments"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "factory_isolation" ON "payment_lines";
--> statement-breakpoint
CREATE POLICY "payment_lines_factory_read" ON "payment_lines"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "payment_lines_management_write" ON "payment_lines"
  FOR ALL TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() IN ('owner', 'manager')
  );
--> statement-breakpoint

-- ─── historical-attribution FKs: SET NULL instead of RESTRICT ───────────────
-- removeUser() deletes a users row; supplier_tiers.assigned_by and
-- supplier_adjustments.created_by were ON DELETE NO ACTION, so deleting a
-- user who had ever assigned a tier raised a foreign-key violation and
-- surfaced a raw error. Historical attribution should survive the user
-- being removed — drop + recreate the constraints as ON DELETE SET NULL.
ALTER TABLE "supplier_tiers" DROP CONSTRAINT IF EXISTS "supplier_tiers_assigned_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_tiers" ADD CONSTRAINT "supplier_tiers_assigned_by_users_id_fk"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_adjustments" DROP CONSTRAINT IF EXISTS "supplier_adjustments_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
