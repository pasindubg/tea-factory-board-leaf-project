INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'supplier-documents',
  'supplier-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE
SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
--> statement-breakpoint

CREATE POLICY "supplier_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
  );
--> statement-breakpoint

-- Field officers upload from the bound phone only; office staff may correct a
-- bad capture from the web.
CREATE POLICY "supplier_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND (
      public.current_user_role() IN ('owner', 'manager', 'supervisor')
      OR (public.current_user_role() = 'field_officer' AND public.device_is_bound())
    )
  );
--> statement-breakpoint

CREATE POLICY "supplier_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() IN ('owner', 'manager', 'supervisor')
  )
  WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() IN ('owner', 'manager', 'supervisor')
  );
--> statement-breakpoint

CREATE POLICY "supplier_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND public.current_user_role() IN ('owner', 'manager')
  );
