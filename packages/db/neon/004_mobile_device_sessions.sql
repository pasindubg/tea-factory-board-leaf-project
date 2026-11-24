-- Neon Auth's JWT is shared across sessions for a user. Match a fingerprint of
-- the opaque session token against the live Auth session before trusting a phone.
CREATE OR REPLACE FUNCTION public.device_is_bound()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_devices d
    JOIN neon_auth.session s ON s.id = d.mobile_session_id AND s."userId" = d.user_id
    WHERE d.user_id = public.request_uid()
      AND d.factory_id = public.current_factory_id()
      AND d.device_id = public.current_device_id()
      AND d.revoked_at IS NULL AND s."expiresAt" > now()
      AND encode(sha256(convert_to(s.token, 'UTF8')), 'hex') =
        current_setting('request.headers', true)::jsonb ->> 'x-mobile-session-proof'
  );
$$;

-- Close the old permanent-claim entry point on Neon. Only a real Auth session
-- for this user can open a mobile session through the replacement RPC.
REVOKE EXECUTE ON FUNCTION public.register_device(text, text, text, text)
  FROM PUBLIC, authenticated, anon, anonymous;

CREATE OR REPLACE FUNCTION public.register_mobile_session(
  p_platform text, p_model text, p_app_version text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := public.request_uid();
  v_device text := public.current_device_id();
  v_proof text := current_setting('request.headers', true)::jsonb ->> 'x-mobile-session-proof';
  v_factory uuid;
  v_session uuid;
  v_existing public.user_devices%ROWTYPE;
BEGIN
  IF v_user IS NULL OR v_device IS NULL OR v_device !~ '^[a-zA-Z0-9._:-]{8,200}$'
    OR v_proof IS NULL OR v_proof !~ '^[a-f0-9]{64}$'
    OR p_platform IS DISTINCT FROM 'android' OR p_model IS NULL OR length(p_model) > 160
    OR p_app_version IS NULL OR length(p_app_version) > 80 THEN
    RETURN 'invalid';
  END IF;

  -- Serialize concurrent sign-ins, even when the user has never signed in before.
  SELECT factory_id INTO v_factory FROM public.users
    WHERE id = v_user AND active IS DISTINCT FROM false AND role IN ('driver', 'field_officer')
    FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  SELECT s.id INTO v_session FROM neon_auth.session s
    WHERE s."userId" = v_user AND s."expiresAt" > now()
      AND encode(sha256(convert_to(s.token, 'UTF8')), 'hex') = v_proof;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;

  -- Sign-in uses a newly issued session. A released or replaced login cannot
  -- re-pair with its saved Auth session, even when it still has a valid JWT.
  SELECT * INTO v_existing FROM public.user_devices
    WHERE user_id = v_user AND factory_id = v_factory AND revoked_at IS NULL FOR UPDATE;
  IF FOUND AND v_existing.device_id = v_device AND v_existing.mobile_session_id = v_session THEN
    RETURN 'bound';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM neon_auth.session s WHERE s.id = v_session
    AND s."createdAt" >= now() - interval '2 minutes')
    OR EXISTS (SELECT 1 FROM public.user_devices d WHERE d.user_id = v_user AND d.mobile_session_id = v_session) THEN
    RETURN 'invalid';
  END IF;
  IF v_existing.id IS NOT NULL AND v_existing.device_id <> v_device AND EXISTS (
    SELECT 1 FROM neon_auth.session s WHERE s.id = v_existing.mobile_session_id
      AND s."userId" = v_user AND s."expiresAt" > now()
  ) THEN
    RETURN 'blocked';
  END IF;

  UPDATE public.user_devices SET revoked_at = now(), revoked_by = NULL
    WHERE user_id = v_user AND factory_id = v_factory AND revoked_at IS NULL;
  INSERT INTO public.user_devices (factory_id, user_id, device_id, platform, model, app_version, mobile_session_id, last_seen_at)
    VALUES (v_factory, v_user, v_device, p_platform, p_model, p_app_version, v_session, now())
  ON CONFLICT (user_id, device_id) DO UPDATE SET platform = EXCLUDED.platform, model = EXCLUDED.model,
    app_version = EXCLUDED.app_version, mobile_session_id = EXCLUDED.mobile_session_id,
    last_seen_at = now(), revoked_at = NULL, revoked_by = NULL
  WHERE user_devices.factory_id = EXCLUDED.factory_id;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.register_mobile_session(text, text, text) FROM PUBLIC, anon, anonymous;
GRANT EXECUTE ON FUNCTION public.register_mobile_session(text, text, text) TO authenticated;
