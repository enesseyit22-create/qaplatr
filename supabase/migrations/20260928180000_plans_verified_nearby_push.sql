-- Standard / Premium paket, onaylı firma ve bölgesel bildirim kotası.
-- Mevcut auth, RLS grant ve push kuyruğu korunur. Kolonlar yoksa eklenir.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'standard';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tax_number text;

DO $$
BEGIN
  IF to_regclass('public.businesses') IS NOT NULL THEN
    ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'standard';
    ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_tier_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_plan_tier_check
      CHECK (plan_tier IN ('standard', 'premium'));
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF to_regclass('public.explore_banners') IS NOT NULL THEN
    ALTER TABLE public.explore_banners ADD COLUMN IF NOT EXISTS company_id uuid;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_push_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_push_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_push_sends_read" ON public.company_push_sends;
CREATE POLICY "company_push_sends_read"
  ON public.company_push_sends FOR SELECT TO authenticated
  USING (
    public.is_current_admin()
    OR company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.touch_device_location(
  p_token text,
  p_lat double precision,
  p_lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := nullif(trim(p_token), '');
BEGIN
  IF v_token IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN;
  END IF;
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RETURN;
  END IF;
  UPDATE public.device_push_tokens
  SET latitude = p_lat,
      longitude = p_lng,
      updated_at = now()
  WHERE fcm_token = v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_device_location(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_device_location(text, double precision, double precision) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_company_verified(
  p_company uuid,
  p_verified boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax text;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  IF p_company IS NULL THEN
    RAISE EXCEPTION 'firma yok' USING ERRCODE = '22023';
  END IF;

  SELECT nullif(trim(coalesce(tax_number, '')), '') INTO v_tax
  FROM public.companies
  WHERE id = p_company;

  IF v_tax IS NULL AND to_regclass('public.businesses') IS NOT NULL THEN
    SELECT nullif(trim(coalesce(tax_number, '')), '') INTO v_tax
    FROM public.businesses
    WHERE company_id = p_company
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF coalesce(p_verified, false) AND v_tax IS NULL THEN
    RAISE EXCEPTION 'Vergi veya T.C. kimlik numarası olmadan onay verilemez.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies
  SET is_verified = coalesce(p_verified, false)
  WHERE id = p_company;

  IF to_regclass('public.businesses') IS NOT NULL THEN
    UPDATE public.businesses
    SET is_verified = coalesce(p_verified, false)
    WHERE company_id = p_company;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_company_verified(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_company_verified(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_apply_plan(p_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_tier text := CASE WHEN p_tier = 'premium' THEN 'premium' ELSE 'standard' END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'yetkisiz' USING ERRCODE = '42501';
  END IF;
  SELECT p.company_id INTO v_company
  FROM public.profiles p
  WHERE p.id = v_uid
  LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Firma bulunamadı.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies
  SET plan_tier = v_tier
  WHERE id = v_company;
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_apply_plan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_apply_plan(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_queue_nearby_push(
  p_title text,
  p_body text
)
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
  v_featured boolean;
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

  SELECT p.company_id INTO v_company
  FROM public.profiles p
  WHERE p.id = v_uid
  LIMIT 1;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Firma bulunamadı.' USING ERRCODE = '42501';
  END IF;

  SELECT c.latitude, c.longitude, coalesce(c.plan_tier, 'standard'), coalesce(c.is_featured, false)
  INTO v_lat, v_lng, v_tier, v_featured
  FROM public.companies c
  WHERE c.id = v_company;

  v_limit := CASE WHEN v_tier = 'premium' OR v_featured THEN 2 ELSE 0 END;

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
    'nearby',
    v_title,
    v_body,
    v_company,
    jsonb_build_object(
      'kind', 'nearby',
      'companyId', v_company,
      'latitude', v_lat,
      'longitude', v_lng,
      'radius_m', 2000,
      'audience', 'users'
    )
  );

  v_used := v_used + 1;
  RETURN jsonb_build_object(
    'ok', true,
    'used', v_used,
    'limit', v_limit,
    'left', greatest(v_limit - v_used, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_queue_nearby_push(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_queue_nearby_push(text, text) TO authenticated;
