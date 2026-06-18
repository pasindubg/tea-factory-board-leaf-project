CREATE TABLE "module_permissions" (
	"factory_id" uuid NOT NULL,
	"module_key" text NOT NULL,
	"allowed_roles" text[] NOT NULL,
	CONSTRAINT "module_permissions_factory_id_module_key_pk" PRIMARY KEY("factory_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_factory_id_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username") WHERE username IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "module_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- All factory members can read module permissions (needed for access checks on every page load)
CREATE POLICY "factory_isolation_read" ON "module_permissions"
  FOR SELECT TO authenticated
  USING (factory_id = public.current_factory_id());
--> statement-breakpoint
-- Helper: returns the current authenticated user's role (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;
--> statement-breakpoint
-- Only owners may insert/update/delete module permission overrides
CREATE POLICY "owner_write" ON "module_permissions"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "owner_update" ON "module_permissions"
  FOR UPDATE TO authenticated
  USING (factory_id = public.current_factory_id())
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "owner_delete" ON "module_permissions"
  FOR DELETE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
-- Username → email lookup used by the password login flow.
-- Accessible to anon so the client can resolve the email before calling signInWithPassword.
-- Returns NULL when no user has that username (indistinguishable from wrong password → no enumeration).
CREATE OR REPLACE FUNCTION public.get_email_for_login(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.users WHERE username = lower(trim(p_username)) LIMIT 1;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_email_for_login TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_for_login TO authenticated;