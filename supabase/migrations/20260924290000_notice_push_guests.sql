-- Yönetim bildirimi kapalı uygulamaya da gider: misafir ve yönetici cihaz token'ı, notice kuyruğu.

ALTER TABLE public.device_push_tokens
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS role text;

DROP FUNCTION IF EXISTS public.register_device_push(text, uuid, text);

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
BEGIN
  IF nullif(trim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'token boş' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, fcm_token, company_id, platform, role, updated_at)
  VALUES (
    v_uid,
    trim(p_token),
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

CREATE OR REPLACE FUNCTION public.enqueue_notice_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'notice',
    left(coalesce(NEW.title, 'QapLA'), 120),
    left(coalesce(NEW.body, ''), 240),
    NEW.company_id,
    jsonb_build_object('audience', coalesce(NEW.audience, 'all'), 'noticeId', NEW.id)
  );
  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_notice_enqueue_push ON public.app_notices;
CREATE TRIGGER on_notice_enqueue_push
  AFTER INSERT ON public.app_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_notice_push();
