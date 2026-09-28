-- Kullanıcı silme/güncellemede kimlikler uuid karşılaştırılır; hikaye izni firmaya zincirli bağlanır.

ALTER TABLE public.app_live_settings
  ADD COLUMN IF NOT EXISTS reach jsonb NOT NULL DEFAULT jsonb_build_object(
    'campaignKm', 2,
    'storyKm', 1,
    'postKm', 2,
    'pushKm', 2,
    'couponKm', 1
  );

DO $$
DECLARE
  v_name text;
BEGIN
  IF to_regclass('public.story_permissions') IS NULL OR to_regclass('public.companies') IS NULL THEN
    RETURN;
  END IF;

  FOR v_name IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.story_permissions'::regclass
      AND con.contype = 'f'
      AND con.confrelid = 'public.companies'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.story_permissions DROP CONSTRAINT %I', v_name);
  END LOOP;

  ALTER TABLE public.story_permissions DROP CONSTRAINT IF EXISTS story_permissions_company_id_fkey;

  DELETE FROM public.story_permissions sp
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = sp.company_id);

  ALTER TABLE public.story_permissions
    ADD CONSTRAINT story_permissions_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_company_id(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_company FROM public.companies c WHERE c.id = p_id;

  IF v_company IS NULL AND to_regclass('public.businesses') IS NOT NULL THEN
    SELECT c.id INTO v_company
    FROM public.businesses b
    JOIN public.companies c ON c.id = b.company_id
    WHERE b.id = p_id
    LIMIT 1;
  END IF;

  RETURN v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_company_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_company_id(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_company_plan(p_company uuid, p_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := CASE WHEN p_tier = 'premium' THEN 'premium' ELSE 'standard' END;
  v_company uuid;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;

  v_company := public.admin_resolve_company_id(p_company);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Firma kaydı bulunamadı.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.companies SET plan_tier = v_tier WHERE id = v_company;

  IF to_regclass('public.story_permissions') IS NOT NULL THEN
    INSERT INTO public.story_permissions (company_id, allowed, updated_at)
    VALUES (v_company, v_tier = 'premium', now())
    ON CONFLICT (company_id) DO UPDATE
    SET allowed = EXCLUDED.allowed, updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_company_plan(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_company_plan(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_profile(
  p_id uuid,
  p_email text,
  p_phone text,
  p_role text,
  p_company_id uuid DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles;
  v_role text := coalesce(nullif(trim(p_role), ''), 'user');
  v_company uuid;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('user', 'merchant', 'admin') THEN
    v_role := 'user';
  END IF;

  IF p_company_id IS NOT NULL THEN
    v_company := public.admin_resolve_company_id(p_company_id);
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'Firma kaydı bulunamadı.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.profiles (email, phone, role, company_id)
    VALUES (lower(trim(p_email)), coalesce(p_phone, ''), v_role, v_company)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.profiles
    SET email = lower(trim(p_email)), phone = coalesce(p_phone, ''), role = v_role, company_id = v_company
    WHERE id = p_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      INSERT INTO public.profiles (id, email, phone, role, company_id)
      VALUES (p_id, lower(trim(p_email)), coalesce(p_phone, ''), v_role, v_company)
      RETURNING * INTO v_row;
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, uuid) TO authenticated;

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

  v_company := public.admin_resolve_company_id(p_company_id);

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
    BEGIN DELETE FROM public.post_likes WHERE post_id IN (SELECT id FROM public.posts WHERE business_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.post_likes WHERE post_id IN (SELECT id FROM public.posts WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN DELETE FROM public.posts WHERE business_id = v_company;
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

REVOKE ALL ON FUNCTION public.admin_delete_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_auth uuid;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'kullanıcı yok' USING ERRCODE = '22023';
  END IF;

  SELECT p.company_id, p.auth_user_id INTO v_company, v_auth
  FROM public.profiles p
  WHERE p.id = p_id;

  -- user_redemptions.user_id metin kolondur.
  BEGIN DELETE FROM public.user_redemptions WHERE user_id IN (p_id::text, v_auth::text);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.follows WHERE user_id IN (p_id, v_auth);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.device_push_tokens WHERE user_id IN (p_id, v_auth);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.company_push_tokens WHERE user_id IN (p_id, v_auth);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN DELETE FROM public.businesses WHERE user_id IN (p_id, v_auth) AND company_id IS NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  DELETE FROM public.profiles WHERE id = p_id;

  IF v_company IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.company_id = v_company
  ) THEN
    PERFORM public.admin_delete_company(v_company);
  END IF;

  BEGIN
    DELETE FROM auth.users WHERE id IN (p_id, v_auth);
  EXCEPTION WHEN undefined_table OR insufficient_privilege THEN NULL;
  END;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO authenticated;

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
  v_radius integer := 2000;
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

  BEGIN
    SELECT greatest(500, least(50000, round(coalesce((reach->>'pushKm')::numeric, 2) * 1000)))::integer
    INTO v_radius
    FROM public.app_live_settings
    WHERE id = 'main';
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    v_radius := 2000;
  END;
  IF v_radius IS NULL THEN
    v_radius := 2000;
  END IF;

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
      'radius_m', v_radius, 'audience', 'users'
    )
  );

  v_used := v_used + 1;
  RETURN jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit, 'left', greatest(v_limit - v_used, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_queue_nearby_push(text, text) TO authenticated;
