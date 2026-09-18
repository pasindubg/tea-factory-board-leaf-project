GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, anonymous;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, anonymous;
-- Preserve each migration's per-function grants; never expose privileged RPCs wholesale.
-- Queue claiming is cross-factory infrastructure, never a user-facing RPC.
REVOKE EXECUTE ON FUNCTION public.claim_background_job(text, integer) FROM PUBLIC, authenticated, anon, anonymous;
REVOKE EXECUTE ON FUNCTION public.get_email_for_login(text) FROM PUBLIC, authenticated, anon, anonymous;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, anonymous;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, anonymous;
