/*
# Auth rolleri, extensions.crypt, e-posta doğrulamasız kayıt

- Şifre karşılaştırması extensions.crypt
- Admin/firma yetkisi profiles.role + e-posta eşleşmesi
- Yeni auth kullanıcıları e-posta/telefon onayı beklemez
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  NEW.email_confirmed_at := coalesce(NEW.email_confirmed_at, now());
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    NEW.phone_confirmed_at := coalesce(NEW.phone_confirmed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_auth_user ON auth.users;
CREATE TRIGGER auto_confirm_auth_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_auth_user();

UPDATE auth.users
SET email_confirmed_at = coalesce(email_confirmed_at, now());

CREATE OR REPLACE FUNCTION public.bootstrap_role(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_email, '')))
    WHEN 'admin@qapla.com' THEN 'admin'
    WHEN 'isletme@qapla.com' THEN 'merchant'
    ELSE 'user'
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role = 'admin'
      AND (
        auth_user_id = auth.uid()
        OR lower(trim(email)) = v_email
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN v_email = 'admin@qapla.com';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_merchant()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role = 'merchant'
      AND (
        auth_user_id = auth.uid()
        OR lower(trim(email)) = v_email
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.companies WHERE lower(trim(coalesce(owner_email, ''))) = v_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text := '';
  v_role text;
  v_company uuid;
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(coalesce(u.email, ''))), coalesce(u.raw_user_meta_data->>'phone', '')
  INTO v_email, v_phone
  FROM auth.users u
  WHERE u.id = v_uid;

  v_role := public.bootstrap_role(v_email);

  SELECT id INTO v_company
  FROM public.companies
  WHERE lower(trim(coalesce(owner_email, ''))) = v_email
  LIMIT 1;

  UPDATE public.profiles
  SET auth_user_id = v_uid
  WHERE auth_user_id IS NULL AND lower(trim(email)) = v_email;

  INSERT INTO public.profiles (auth_user_id, email, phone, role, company_id)
  VALUES (
    v_uid,
    v_email,
    coalesce(v_phone, ''),
    v_role,
    CASE WHEN v_role = 'merchant' THEN v_company ELSE NULL END
  )
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = excluded.email,
        phone = CASE WHEN excluded.phone = '' THEN public.profiles.phone ELSE excluded.phone END,
        role = CASE
          WHEN public.profiles.role IN ('admin', 'merchant') THEN public.profiles.role
          WHEN excluded.role IN ('admin', 'merchant') THEN excluded.role
          ELSE public.profiles.role
        END,
        company_id = coalesce(public.profiles.company_id, excluded.company_id)
  RETURNING * INTO v_row;

  IF v_row.role = 'user' AND v_role IN ('admin', 'merchant') THEN
    UPDATE public.profiles
    SET role = v_role, company_id = coalesce(company_id, v_company)
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_merchant_company()
RETURNS public.companies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_row public.companies;
  v_company_id uuid;
BEGIN
  IF NOT public.is_current_merchant() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid() OR lower(trim(email)) = v_email
  ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.companies WHERE id = v_company_id;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.companies
    WHERE lower(trim(coalesce(owner_email, ''))) = v_email
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.companies WHERE name = 'Mod Kahve' LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.is_current_admin()
    OR EXISTS (
      SELECT 1
      FROM public.app_admin_config
      WHERE id = 1
        AND password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
    );
$$;

CREATE OR REPLACE FUNCTION public.merchant_verify(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.is_current_merchant()
    OR EXISTS (
      SELECT 1
      FROM public.app_merchant_config
      WHERE id = 1
        AND password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.bootstrap_role(NEW.email);
  v_company uuid;
BEGIN
  SELECT id INTO v_company
  FROM public.companies
  WHERE lower(trim(coalesce(owner_email, ''))) = lower(trim(coalesce(NEW.email, '')))
  LIMIT 1;

  INSERT INTO public.profiles (auth_user_id, email, phone, role, company_id)
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    CASE WHEN v_role = 'merchant' THEN v_company ELSE NULL END
  )
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = excluded.email,
        phone = CASE
          WHEN excluded.phone IS NULL OR excluded.phone = '' THEN public.profiles.phone
          ELSE excluded.phone
        END,
        role = CASE
          WHEN public.profiles.role IN ('admin', 'merchant') THEN public.profiles.role
          ELSE excluded.role
        END,
        company_id = coalesce(public.profiles.company_id, excluded.company_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_auth();

UPDATE public.profiles
SET role = 'admin'
WHERE lower(trim(email)) = 'admin@qapla.com';

UPDATE public.profiles p
SET
  role = 'merchant',
  company_id = coalesce(
    p.company_id,
    (SELECT c.id FROM public.companies c WHERE c.name = 'Mod Kahve' LIMIT 1)
  )
WHERE lower(trim(p.email)) = 'isletme@qapla.com';

GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_merchant() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_merchant_company() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_role(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.merchant_create_campaign(
  p_email text,
  p_password text,
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
  IF auth.uid() IS NOT NULL AND public.is_current_merchant() THEN
    v_company := public.current_merchant_company();
  ELSE
    v_company := public.resolve_merchant_company(p_email, p_password);
  END IF;

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

CREATE OR REPLACE FUNCTION public.merchant_campaign_stats(p_email text, p_password text)
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
  IF auth.uid() IS NOT NULL AND public.is_current_merchant() THEN
    v_company := public.current_merchant_company();
  ELSE
    v_company := public.resolve_merchant_company(p_email, p_password);
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_active AND expiry_date >= CURRENT_DATE)
  INTO v_campaigns, v_active
  FROM public.campaigns
  WHERE company_id = v_company.id;

  SELECT count(*)
  INTO v_redemptions
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
