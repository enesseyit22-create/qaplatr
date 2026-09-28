-- Aynı cihaz token'ı bir kez durur. Eski kopyalar silinir, kayıt upsert olur.

DELETE FROM public.device_push_tokens AS older
USING public.device_push_tokens AS newer
WHERE older.fcm_token = newer.fcm_token
  AND older.ctid <> newer.ctid
  AND older.updated_at <= newer.updated_at
  AND (older.updated_at < newer.updated_at OR older.ctid < newer.ctid);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_fcm_uidx
  ON public.device_push_tokens (fcm_token);

DELETE FROM public.company_push_tokens AS older
USING public.company_push_tokens AS newer
WHERE older.fcm_token = newer.fcm_token
  AND older.ctid <> newer.ctid
  AND older.updated_at <= newer.updated_at
  AND (older.updated_at < newer.updated_at OR older.ctid < newer.ctid);

CREATE UNIQUE INDEX IF NOT EXISTS company_push_tokens_fcm_uidx
  ON public.company_push_tokens (fcm_token);

CREATE OR REPLACE FUNCTION public.register_device_push(
  p_token text,
  p_company uuid DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_role text DEFAULT 'guest'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := CASE
    WHEN p_role IN ('guest', 'user', 'merchant', 'admin') THEN p_role
    WHEN v_uid IS NULL THEN 'guest'
    ELSE 'user'
  END;
  v_token text := nullif(trim(p_token), '');
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'token boş' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, fcm_token, company_id, platform, role, updated_at)
  VALUES (
    v_uid,
    v_token,
    p_company,
    nullif(trim(coalesce(p_platform, '')), ''),
    v_role,
    now()
  )
  ON CONFLICT (fcm_token) DO UPDATE
  SET user_id = excluded.user_id,
      company_id = excluded.company_id,
      platform = excluded.platform,
      role = excluded.role,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_push(text, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_company_push(
  p_company uuid,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := nullif(trim(p_token), '');
BEGIN
  IF v_uid IS NULL OR p_company IS NULL OR v_token IS NULL THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.company_push_tokens
  WHERE fcm_token = v_token
    AND NOT (company_id = p_company AND user_id = v_uid);

  INSERT INTO public.company_push_tokens (company_id, user_id, fcm_token, updated_at)
  VALUES (p_company, v_uid, v_token, now())
  ON CONFLICT (company_id, user_id) DO UPDATE
  SET fcm_token = excluded.fcm_token,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_company_push(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_company_push(uuid, text) TO authenticated;
