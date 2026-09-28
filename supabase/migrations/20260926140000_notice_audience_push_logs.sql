-- Yönetim bildirimi: misafir kitlesi, push kuyruğu ve gönderim günlüğü.

ALTER TABLE public.app_notices DROP CONSTRAINT IF EXISTS app_notices_audience_check;
ALTER TABLE public.app_notices
  ADD CONSTRAINT app_notices_audience_check
  CHECK (audience IN ('all', 'guests', 'users', 'merchants', 'admin'));

DROP POLICY IF EXISTS "Notices readable by audience" ON public.app_notices;
CREATE POLICY "Notices readable by audience"
  ON public.app_notices FOR SELECT TO anon, authenticated
  USING (
    (
      audience = 'admin'
      AND public.is_current_admin()
    )
    OR (
      audience <> 'admin'
      AND (
        audience = 'all'
        OR public.is_current_admin()
        OR (
          audience = 'guests'
          AND auth.uid() IS NULL
        )
        OR (
          audience = 'users'
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.role = 'user'
              AND (p.auth_user_id = auth.uid() OR p.id = auth.uid())
          )
        )
        OR (
          audience = 'merchants'
          AND public.is_current_merchant()
          AND (
            company_id IS NULL
            OR company_id IN (
              SELECT p.company_id
              FROM public.profiles p
              WHERE p.company_id IS NOT NULL
                AND (
                  p.auth_user_id = auth.uid()
                  OR p.id = auth.uid()
                  OR lower(trim(p.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
                )
            )
            OR company_id IN (
              SELECT c.id
              FROM public.companies c
              WHERE lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
          )
        )
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id text,
  audience text,
  kind text,
  targets integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read notification logs" ON public.notification_logs;
CREATE POLICY "Admins read notification logs"
  ON public.notification_logs FOR SELECT TO authenticated
  USING (public.is_current_admin());

REVOKE INSERT, UPDATE, DELETE ON public.notification_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_admin_notice_push(p_notice uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.app_notices%ROWTYPE;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.app_notices WHERE id = p_notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bildirim yok' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.push_outbox
    WHERE kind = 'notice'
      AND payload->>'noticeId' = p_notice::text
      AND sent_at IS NULL
  ) THEN
    INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
    VALUES (
      'notice',
      left(coalesce(v_row.title, 'QapLA'), 120),
      left(coalesce(v_row.body, ''), 240),
      CASE WHEN v_row.audience = 'merchants' THEN v_row.company_id ELSE NULL END,
      jsonb_build_object('audience', coalesce(v_row.audience, 'all'), 'noticeId', v_row.id)
    );
  END IF;

  PERFORM public.kick_push_dispatch();
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_admin_notice_push(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_admin_notice_push(uuid) TO authenticated;
