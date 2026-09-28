/*
# Profiller, firma sahipliği, admin kullanıcı/rapor RPC

- companies.owner_email / owner_password_hash: firma girişi
- profiles: e-posta + telefon + rol
- Auth kullanıcısı oluşunca profil otomatik yazılır
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_owner_email_idx
  ON public.companies (lower(owner_email))
  WHERE owner_email IS NOT NULL AND length(trim(owner_email)) > 0;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'merchant', 'admin')),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS profiles_company_idx ON public.profiles (company_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.app_merchant_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL
);

INSERT INTO public.app_merchant_config (id, password_hash)
VALUES (1, extensions.crypt('QapLaFirma#26', extensions.gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

UPDATE public.companies
SET
  owner_email = coalesce(nullif(owner_email, ''), 'isletme@qapla.com'),
  owner_password_hash = coalesce(owner_password_hash, extensions.crypt('QapLaFirma#26', extensions.gen_salt('bf')))
WHERE name = 'Mod Kahve';

CREATE OR REPLACE FUNCTION public.merchant_verify(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_merchant_config
    WHERE id = 1
      AND password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_merchant_company(p_email text, p_password text)
RETURNS public.companies
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.companies;
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  SELECT *
  INTO v_row
  FROM public.companies
  WHERE owner_email IS NOT NULL
    AND lower(trim(owner_email)) = v_email
    AND (
      public.merchant_verify(p_password)
      OR (
        owner_password_hash IS NOT NULL
        AND owner_password_hash = extensions.crypt(coalesce(p_password, ''), owner_password_hash)
      )
    )
  ORDER BY created_at
  LIMIT 1;

  IF v_row.id IS NULL AND public.merchant_verify(p_password) THEN
    SELECT *
    INTO v_row
    FROM public.companies
    WHERE lower(trim(coalesce(owner_email, ''))) = v_email
       OR name = 'Mod Kahve'
    ORDER BY CASE WHEN lower(trim(coalesce(owner_email, ''))) = v_email THEN 0 ELSE 1 END, created_at
    LIMIT 1;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

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
  v_company := public.resolve_merchant_company(p_email, p_password);

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
  v_company := public.resolve_merchant_company(p_email, p_password);

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

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, phone)
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (auth_user_id) DO UPDATE
    SET email = excluded.email,
        phone = CASE
          WHEN excluded.phone IS NULL OR excluded.phone = '' THEN public.profiles.phone
          ELSE excluded.phone
        END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_auth();

CREATE OR REPLACE FUNCTION public.upsert_own_profile(p_phone text)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (auth_user_id, email, phone)
  VALUES (v_uid, coalesce((SELECT email FROM auth.users WHERE id = v_uid), ''), coalesce(p_phone, ''))
  ON CONFLICT (auth_user_id) DO UPDATE
    SET phone = coalesce(nullif(trim(p_phone), ''), public.profiles.phone)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_profiles(p_admin_password text)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_verify(p_admin_password) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.profiles
  ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_profile(
  p_admin_password text,
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
  IF NOT public.admin_verify(p_admin_password) THEN
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
    SET
      email = lower(trim(p_email)),
      phone = coalesce(p_phone, ''),
      role = v_role,
      company_id = p_company_id
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

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_admin_password text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_verify(p_admin_password) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.profiles WHERE id = p_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_redemptions(p_admin_password text)
RETURNS SETOF public.user_redemptions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_verify(p_admin_password) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.user_redemptions
  ORDER BY redeemed_at DESC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_verify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_merchant_company(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merchant_create_campaign(text, text, text, numeric, date, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merchant_campaign_stats(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_own_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_profiles(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_profile(text, uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_profile(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_redemptions(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_merchant_company(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_create_campaign(text, text, text, numeric, date, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_campaign_stats(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_own_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_profile(text, uuid, text, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_redemptions(text) TO anon, authenticated;
