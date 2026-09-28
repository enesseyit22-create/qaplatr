-- Tümü tek kuyruk satırı yerine misafir, kullanıcı ve firma olarak ayrı gider.

CREATE OR REPLACE FUNCTION public.enqueue_notice_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.audience, 'all') = 'all' THEN
    INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
    SELECT
      'notice',
      left(coalesce(NEW.title, 'QapLA'), 120),
      left(coalesce(NEW.body, ''), 240),
      CASE WHEN audience_name = 'merchants' THEN NEW.company_id ELSE NULL END,
      jsonb_build_object('audience', audience_name, 'noticeId', NEW.id)
    FROM unnest(ARRAY['guests', 'users', 'merchants']) AS audience_name;
  ELSE
    INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
    VALUES (
      'notice',
      left(coalesce(NEW.title, 'QapLA'), 120),
      left(coalesce(NEW.body, ''), 240),
      CASE WHEN NEW.audience = 'merchants' THEN NEW.company_id ELSE NULL END,
      jsonb_build_object('audience', coalesce(NEW.audience, 'all'), 'noticeId', NEW.id)
    );
  END IF;

  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_admin_notice_push(p_notice uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.app_notices%ROWTYPE;
  v_audience text;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.app_notices WHERE id = p_notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bildirim yok' USING ERRCODE = 'P0002';
  END IF;

  IF coalesce(v_row.audience, 'all') = 'all' THEN
    FOREACH v_audience IN ARRAY ARRAY['guests', 'users', 'merchants']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.push_outbox
        WHERE kind = 'notice'
          AND payload->>'noticeId' = p_notice::text
          AND payload->>'audience' = v_audience
          AND sent_at IS NULL
      ) THEN
        INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
        VALUES (
          'notice',
          left(coalesce(v_row.title, 'QapLA'), 120),
          left(coalesce(v_row.body, ''), 240),
          CASE WHEN v_audience = 'merchants' THEN v_row.company_id ELSE NULL END,
          jsonb_build_object('audience', v_audience, 'noticeId', v_row.id)
        );
      END IF;
    END LOOP;
  ELSIF NOT EXISTS (
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
