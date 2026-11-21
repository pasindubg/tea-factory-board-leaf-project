-- Drivers share field registration's existing device restriction. The separate
-- factory_isolation policy remains authoritative for every read and write.
ALTER POLICY "field_officer_device_bound" ON "public"."suppliers"
  USING (public.current_user_role() NOT IN ('field_officer', 'driver') OR public.device_is_bound())
  WITH CHECK (public.current_user_role() NOT IN ('field_officer', 'driver') OR public.device_is_bound());
--> statement-breakpoint
ALTER POLICY "supplier_documents_insert" ON "storage"."objects"
  WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.current_factory_id()::text
    AND (
      public.current_user_role() IN ('owner', 'manager', 'supervisor')
      OR (public.current_user_role() IN ('field_officer', 'driver') AND public.device_is_bound())
    )
  );
