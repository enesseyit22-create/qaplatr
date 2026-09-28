-- Push kuyruğunu kampanya ve kupon değişikliklerinde hemen FCM'ye bağlar.

DELETE FROM public.device_push_tokens a
USING public.device_push_tokens b
WHERE a.fcm_token = b.fcm_token
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_fcm_uidx
  ON public.device_push_tokens (fcm_token);

CREATE OR REPLACE FUNCTION public.register_device_push(
  p_token text,
  p_company uuid DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR nullif(trim(p_token), '') IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, fcm_token, company_id, platform, updated_at)
  VALUES (v_uid, trim(p_token), p_company, nullif(trim(coalesce(p_platform, '')), ''), now())
  ON CONFLICT (fcm_token) DO UPDATE
  SET user_id = excluded.user_id,
      company_id = excluded.company_id,
      platform = excluded.platform,
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_push(text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kick_push_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name IN ('supabase_url', 'project_url')
    LIMIT 1;
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name IN ('service_role_key', 'supabase_service_role_key')
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
      NULL;
  END;

  v_url := coalesce(nullif(v_url, ''), nullif(current_setting('app.supabase_url', true), ''));
  v_key := coalesce(nullif(v_key, ''), nullif(current_setting('app.service_role_key', true), ''));
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/dispatch-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.campaigns%ROWTYPE;
  v_name text;
  v_title text;
  v_body text;
  v_kind text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF v_row.company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' AND COALESCE(v_row.is_active, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND COALESCE(NEW.is_active, false) IS NOT TRUE
    AND COALESCE(OLD.is_active, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(c.name), ''), 'Firma') INTO v_name
  FROM public.companies c
  WHERE c.id = v_row.company_id;

  v_title := coalesce(nullif(trim(v_row.title), ''), 'Kampanya');
  IF TG_OP = 'DELETE' THEN
    v_kind := 'campaign_delete';
    v_body := coalesce(v_name, 'Firma') || ' bir kampanyayı kaldırdı.';
  ELSIF TG_OP = 'UPDATE' THEN
    v_kind := 'campaign_update';
    v_body := coalesce(v_name, 'Firma') || ' kampanyasını güncelledi.';
  ELSE
    v_kind := 'campaign';
    v_body := coalesce(v_name, 'Firma') || ' yeni bir kampanya paylaştı.';
  END IF;

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    v_kind,
    v_title,
    v_body,
    v_row.company_id,
    jsonb_build_object('campaignId', v_row.id, 'companyId', v_row.company_id)
  );

  PERFORM public.kick_push_dispatch();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_enqueue_push ON public.campaigns;
CREATE TRIGGER on_campaign_enqueue_push
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_campaign_push();

CREATE OR REPLACE FUNCTION public.enqueue_coupon_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.coupon_tickets%ROWTYPE;
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF v_row.company_id IS NULL AND v_row.user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' OR v_row.status = 'deleted' THEN
    v_kind := 'coupon_delete';
    v_title := 'Kupon silindi';
    v_body := 'Bir kupon kaldırıldı.';
  ELSIF TG_OP = 'INSERT' THEN
    v_kind := 'coupon';
    v_title := 'Yeni kupon';
    v_body := 'Yeni bir kupon oluşturuldu.';
  ELSE
    v_kind := 'coupon_update';
    v_title := 'Kupon güncellendi';
    v_body := 'Kupon durumu değişti.';
  END IF;

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    v_kind,
    v_title,
    v_body,
    v_row.company_id,
    jsonb_build_object('couponId', v_row.id, 'companyId', v_row.company_id, 'userId', v_row.user_id, 'status', v_row.status)
  );

  PERFORM public.kick_push_dispatch();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_coupon_enqueue_push ON public.coupon_tickets;
CREATE TRIGGER on_coupon_enqueue_push
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_coupon_push();
