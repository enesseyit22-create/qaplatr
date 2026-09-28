/*
# Admin firma/kampanya yazma yetkisi

- campaigns.details: kampanya açıklaması.
- admin_create/delete/set_featured/create_campaign: admin şifresi doğrulanarak SECURITY DEFINER yazar.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.app_admin_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  password_hash text NOT NULL
);

INSERT INTO public.app_admin_config (id, password_hash)
VALUES (1, extensions.crypt('QapLaAdmin#26', extensions.gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_verify(p_password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_admin_config
    WHERE id = 1
      AND password_hash = extensions.crypt(coalesce(p_password, ''), password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_create_company(
  p_admin_password text,
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
  IF NOT public.admin_verify(p_admin_password) THEN
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

CREATE OR REPLACE FUNCTION public.admin_delete_company(
  p_admin_password text,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_verify(p_admin_password) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.companies WHERE id = p_company_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_company_featured(
  p_admin_password text,
  p_company_id uuid,
  p_is_featured boolean
)
RETURNS public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.companies;
BEGIN
  IF NOT public.admin_verify(p_admin_password) THEN
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

CREATE OR REPLACE FUNCTION public.admin_create_campaign(
  p_admin_password text,
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
  IF NOT public.admin_verify(p_admin_password) THEN
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

REVOKE ALL ON FUNCTION public.admin_verify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_company(text, text, text, text, double precision, double precision, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_company(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_company_featured(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_campaign(text, uuid, text, numeric, date, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_company(text, text, text, text, double precision, double precision, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_company_featured(text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_campaign(text, uuid, text, numeric, date, text, boolean) TO anon, authenticated;
