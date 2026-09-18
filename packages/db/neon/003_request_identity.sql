CREATE OR REPLACE FUNCTION public.request_uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

GRANT EXECUTE ON FUNCTION public.request_uid() TO authenticated, anonymous;

DO $$
DECLARE
  fn record;
  pol record;
BEGIN
  FOR fn IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND p.prosrc LIKE '%auth.uid()%'
  LOOP
    EXECUTE replace(pg_get_functiondef(fn.oid), 'auth.uid()', 'public.request_uid()');
  END LOOP;

  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%auth.uid()%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename)
      || CASE WHEN pol.qual IS NULL THEN ''
         ELSE format(' USING (%s)', replace(pol.qual, 'auth.uid()', 'public.request_uid()')) END
      || CASE WHEN pol.with_check IS NULL THEN ''
         ELSE format(' WITH CHECK (%s)', replace(pol.with_check, 'auth.uid()', 'public.request_uid()')) END;
  END LOOP;
END $$;
