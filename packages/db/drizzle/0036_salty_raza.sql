ALTER TABLE "factories" ADD COLUMN "logo_path" text;
--> statement-breakpoint

-- Factory identity is visible to every employee in the tenant, but only an
-- owner may change it.
DROP POLICY IF EXISTS "factory_isolation" ON "factories";
--> statement-breakpoint
CREATE POLICY "factories_factory_read" ON "factories"
  FOR SELECT TO authenticated
  USING (id = public.current_factory_id());
--> statement-breakpoint
CREATE POLICY "factories_owner_update" ON "factories"
  FOR UPDATE TO authenticated
  USING (
    id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    id = public.current_factory_id()
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint

-- Private factory branding. Every authenticated factory member may view their
-- factory image; only owners may create, replace, or delete it.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'factory-branding',
  'factory-branding',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
--> statement-breakpoint
CREATE POLICY "factory_branding_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'factory-branding'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
  );
--> statement-breakpoint
CREATE POLICY "factory_branding_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'factory-branding'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "factory_branding_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'factory-branding'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() = 'owner'
  )
  WITH CHECK (
    bucket_id = 'factory-branding'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() = 'owner'
  );
--> statement-breakpoint
CREATE POLICY "factory_branding_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'factory-branding'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() = 'owner'
  );
