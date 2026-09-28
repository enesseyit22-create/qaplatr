-- Sabit paket fiyatları, admin paket/kota ataması, sistem bildirimi filtresi ve kalıcı silme.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS push_quota_override integer;

CREATE OR REPLACE FUNCTION public.admin_set_company_plan(p_company uuid, p_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := CASE WHEN p_tier = 'premium' THEN 'premium' ELSE 'standard' END;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies
  SET plan_tier = v_tier
  WHERE id = p_company;
  IF to_regclass('public.story_permissions') IS NOT NULL THEN
    INSERT INTO public.story_permissions (company_id, allowed, updated_at)
    VALUES (p_company, v_tier = 'premium', now())
    ON CONFLICT (company_id) DO UPDATE
    SET allowed = EXCLUDED.allowed, updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_company_plan(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_company_plan(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_push_quota(p_company uuid, p_quota integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies
  SET push_quota_override = CASE WHEN p_quota IS NULL OR p_quota < 0 THEN NULL ELSE least(p_quota, 52) END
  WHERE id = p_company;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_push_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_push_quota(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_queue_nearby_push(p_title text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_lat double precision;
  v_lng double precision;
  v_tier text;
  v_override integer;
  v_limit integer;
  v_used integer;
  v_title text := left(trim(coalesce(p_title, '')), 80);
  v_body text := left(trim(coalesce(p_body, '')), 180);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF v_title = '' OR v_body = '' THEN
    RAISE EXCEPTION 'Başlık ve metin gerekli.' USING ERRCODE = '22023';
  END IF;

  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.id = v_uid LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Firma bulunamadı.' USING ERRCODE = '42501';
  END IF;

  SELECT c.latitude, c.longitude, coalesce(c.plan_tier, 'standard'), c.push_quota_override
  INTO v_lat, v_lng, v_tier, v_override
  FROM public.companies c
  WHERE c.id = v_company;

  v_limit := coalesce(v_override, CASE WHEN v_tier = 'premium' THEN 2 ELSE 0 END);

  SELECT count(*)::integer INTO v_used
  FROM public.company_push_sends s
  WHERE s.company_id = v_company
    AND s.created_at >= date_trunc('week', now());

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'Bu haftaki bildirim hakkın doldu.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.company_push_sends (company_id, title, body)
  VALUES (v_company, v_title, v_body);

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'nearby', v_title, v_body, v_company,
    jsonb_build_object(
      'kind', 'nearby', 'companyId', v_company,
      'latitude', v_lat, 'longitude', v_lng,
      'radius_m', 2000, 'audience', 'users'
    )
  );

  v_used := v_used + 1;
  RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit, 'left', greatest(v_limit - v_used, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notice_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hay text := lower(coalesce(NEW.title, '') || ' ' || coalesce(NEW.body, ''));
BEGIN
  IF v_hay ~ '(onay bekliyor|firma başvurusu|yeni kullanıcı|yeni üye|kayıt oldu)' THEN
    INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
    VALUES (
      'notice',
      left(coalesce(NEW.title, 'QapLA'), 120),
      left(coalesce(NEW.body, ''), 240),
      NEW.company_id,
      jsonb_build_object('audience', 'admin', 'noticeId', NEW.id)
    );
    PERFORM public.kick_push_dispatch();
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'kullanıcı yok' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.profiles WHERE id = p_id;

  BEGIN DELETE FROM public.user_redemptions WHERE user_id = p_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.follows WHERE user_id = p_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.device_push_tokens WHERE user_id = p_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.company_push_tokens WHERE user_id = p_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.businesses WHERE user_id = p_id AND company_id IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  DELETE FROM public.profiles WHERE id = p_id;

  IF v_company IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE company_id = v_company
  ) THEN
    PERFORM public.admin_delete_company(v_company);
  END IF;

  BEGIN
    DELETE FROM auth.users WHERE id = p_id;
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN NULL;
  END;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_deleted boolean := false;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'Bu işlem için yönetici yetkisi gerekir.' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Firma kimliği boş.' USING ERRCODE = '22023';
  END IF;

  SELECT c.id INTO v_company FROM public.companies c WHERE c.id = p_company_id;
  IF v_company IS NULL AND to_regclass('public.businesses') IS NOT NULL THEN
    SELECT b.company_id INTO v_company
    FROM public.businesses b
    WHERE b.id = p_company_id AND b.company_id IS NOT NULL;
  END IF;

  IF v_company IS NOT NULL THEN
    BEGIN DELETE FROM public.user_redemptions WHERE campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.coupon_tickets WHERE company_id = v_company OR campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.campaigns WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.follows WHERE business_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.follows WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.post_likes WHERE post_id IN (SELECT id FROM public.posts WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.posts WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.stories WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.story_permissions WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.company_push_tokens WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.company_push_sends WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.explore_banners WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN UPDATE public.device_push_tokens SET company_id = NULL WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.push_outbox WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.app_notices WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN
      UPDATE public.profiles
      SET company_id = NULL, role = CASE WHEN role = 'merchant' THEN 'user' ELSE role END
      WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.businesses WHERE company_id = v_company OR id = p_company_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    DELETE FROM public.companies WHERE id = v_company;
    v_deleted := FOUND;
  ELSIF to_regclass('public.businesses') IS NOT NULL THEN
    DELETE FROM public.businesses WHERE id = p_company_id;
    v_deleted := FOUND;
  END IF;

  IF NOT v_deleted THEN
    RAISE EXCEPTION 'Firma kaydı bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  RETURN true;
END;
$$;
