/*
# Admin/firma RPC: yalnızca Auth oturumu + profiles.role

Şifre hash / p_admin_password / p_password parametreleri kaldırıldı.
*/

CREATE OR REPLACE FUNCTION public.admin_verify(p_password text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_current_admin();
$$;

DROP FUNCTION IF EXISTS public.admin_create_company(text, text, text, text, double precision, double precision, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_create_company(
  p_name text,
  p_description text,
  p_category text,
  p_latitude double precision,
  p_longitude double precision,
  p_address text,
  p_is_featured boolean DEFAULT false
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.companies;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.companies (name, description, category, latitude, longitude, address, is_featured)
  VALUES (
    trim(p_name),
    coalesce(p_description, ''),
    trim(p_category),
    p_latitude,
    p_longitude,
    trim(p_address),
    coalesce(p_is_featured, false)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_delete_company(text, uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.companies WHERE id = p_company_id;
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_set_company_featured(text, uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_set_company_featured(p_company_id uuid, p_is_featured boolean)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.companies;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.companies
  SET is_featured = p_is_featured
  WHERE id = p_company_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_create_campaign(text, uuid, text, numeric, date, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_create_campaign(
  p_company_id uuid,
  p_title text,
  p_discount_rate numeric,
  p_expiry_date date,
  p_details text DEFAULT '',
  p_is_active boolean DEFAULT true
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.campaigns;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.campaigns (company_id, title, discount_rate, expiry_date, details, is_active)
  VALUES (
    p_company_id,
    trim(p_title),
    p_discount_rate,
    p_expiry_date,
    coalesce(p_details, ''),
    coalesce(p_is_active, true)
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_profiles(text);
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_upsert_profile(text, uuid, text, text, text, uuid);
CREATE FUNCTION public.admin_upsert_profile(
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
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('user', 'merchant', 'admin') THEN
    v_role := 'user';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.profiles (email, phone, role, company_id)
    VALUES (lower(trim(p_email)), coalesce(p_phone, ''), v_role, p_company_id)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.profiles
    SET email = lower(trim(p_email)), phone = coalesce(p_phone, ''), role = v_role, company_id = p_company_id
    WHERE id = p_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      INSERT INTO public.profiles (id, email, phone, role, company_id)
      VALUES (p_id, lower(trim(p_email)), coalesce(p_phone, ''), v_role, p_company_id)
      RETURNING * INTO v_row;
    END IF;
  END IF;
  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_delete_profile(text, uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.profiles WHERE id = p_id;
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_redemptions(text);
CREATE OR REPLACE FUNCTION public.admin_list_redemptions()
RETURNS SETOF public.user_redemptions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.user_redemptions ORDER BY redeemed_at DESC LIMIT 500;
END;
$$;

DROP FUNCTION IF EXISTS public.merchant_create_campaign(text, text, text, numeric, date, text, boolean);
CREATE OR REPLACE FUNCTION public.merchant_create_campaign(
  p_title text,
  p_discount_rate numeric,
  p_expiry_date date,
  p_details text DEFAULT '',
  p_is_active boolean DEFAULT true
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies;
  v_row public.campaigns;
BEGIN
  v_company := public.current_merchant_company();

  INSERT INTO public.campaigns (company_id, title, discount_rate, expiry_date, details, is_active)
  VALUES (
    v_company.id,
    trim(p_title),
    p_discount_rate,
    p_expiry_date,
    coalesce(p_details, ''),
    coalesce(p_is_active, true)
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.merchant_campaign_stats(text, text);
CREATE OR REPLACE FUNCTION public.merchant_campaign_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies;
  v_campaigns integer := 0;
  v_active integer := 0;
  v_redemptions integer := 0;
BEGIN
  v_company := public.current_merchant_company();

  SELECT count(*), count(*) FILTER (WHERE is_active AND expiry_date >= CURRENT_DATE)
  INTO v_campaigns, v_active
  FROM public.campaigns
  WHERE company_id = v_company.id;

  SELECT count(*) INTO v_redemptions
  FROM public.user_redemptions ur
  JOIN public.campaigns c ON c.id = ur.campaign_id
  WHERE c.company_id = v_company.id;

  RETURN jsonb_build_object(
    'company_id', v_company.id,
    'campaigns', v_campaigns,
    'active_campaigns', v_active,
    'redemptions', v_redemptions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_company(text, text, text, double precision, double precision, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_company_featured(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_campaign(uuid, text, numeric, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_redemptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_create_campaign(text, numeric, date, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_campaign_stats() TO authenticated;
