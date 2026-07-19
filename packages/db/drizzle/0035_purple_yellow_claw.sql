-- Self-service staff profiles are intentionally separate from public.users.
-- The users table is factory-readable for account administration; identity
-- numbers, birth dates, addresses, and employment notes must not inherit that
-- broad read policy.

CREATE TABLE "user_profiles" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "factory_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "national_id_number" text,
  "date_of_birth" date,
  "address" text,
  "phone" text,
  "emergency_contact_name" text,
  "emergency_contact_phone" text,
  "employee_number" text,
  "job_title" text,
  "department" text,
  "employment_type" text,
  "employment_start_date" date,
  "qualifications" text,
  "notes" text,
  "visible_to_colleagues" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_profiles_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_profiles_factory_id_factories_id_fk"
    FOREIGN KEY ("factory_id") REFERENCES "public"."factories"("id")
);
--> statement-breakpoint
CREATE INDEX "idx_user_profiles_factory" ON "user_profiles" USING btree ("factory_id");
--> statement-breakpoint
CREATE INDEX "idx_user_profiles_visible" ON "user_profiles" USING btree ("factory_id", "visible_to_colleagues");
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The base row is always private. A separate narrow function below exposes
-- only safe directory fields when the user opts in; this prevents identity
-- numbers, birth dates, addresses, emergency contacts, and notes from leaking
-- through a direct API query.
CREATE POLICY "user_profiles_read" ON "user_profiles"
  FOR SELECT TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND user_id = (SELECT auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "user_profiles_self_insert" ON "user_profiles"
  FOR INSERT TO authenticated
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND user_id = (SELECT auth.uid())
  );
--> statement-breakpoint
CREATE POLICY "user_profiles_self_update" ON "user_profiles"
  FOR UPDATE TO authenticated
  USING (
    factory_id = public.current_factory_id()
    AND user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    factory_id = public.current_factory_id()
    AND user_id = (SELECT auth.uid())
  );
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "user_profiles" TO authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "user_profiles" FROM anon;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.list_visible_staff_profiles()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  role text,
  phone text,
  job_title text,
  department text,
  employment_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profile.user_id,
    profile.full_name,
    account.role,
    profile.phone,
    profile.job_title,
    profile.department,
    profile.employment_type
  FROM public.user_profiles profile
  INNER JOIN public.users account ON account.id = profile.user_id
  WHERE auth.uid() IS NOT NULL
    AND profile.factory_id = public.current_factory_id()
    AND account.factory_id = public.current_factory_id()
    AND profile.visible_to_colleagues = true
    AND account.active IS DISTINCT FROM false
  ORDER BY profile.full_name;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_visible_staff_profiles() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_visible_staff_profiles() FROM anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_visible_staff_profiles() TO authenticated;
--> statement-breakpoint

-- Username is account data, not profile data. This narrow RPC lets a signed-in
-- user update only their own login identifier without granting broad UPDATE on
-- public.users (which would expose role/factory/active fields to tampering).
CREATE OR REPLACE FUNCTION public.update_own_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_username text := lower(trim(p_username));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF normalized_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN
    RAISE EXCEPTION 'Username must be 3 to 40 characters using letters, numbers, dots, underscores, or hyphens'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET username = normalized_username
  WHERE id = auth.uid()
    AND factory_id = public.current_factory_id()
    AND active IS DISTINCT FROM false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active user profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN normalized_username;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_own_username(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_own_username(text) FROM anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_own_username(text) TO authenticated;
