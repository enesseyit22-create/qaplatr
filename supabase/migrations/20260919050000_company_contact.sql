ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS public.admin_create_company(text, text, text, double precision, double precision, text, boolean);
DROP FUNCTION IF EXISTS public.admin_create_company(text, text, text, double precision, double precision, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.admin_create_company(
  p_name text,
  p_description text,
  p_category text,
  p_latitude double precision,
  p_longitude double precision,
  p_address text,
  p_is_featured boolean DEFAULT false,
  p_phone text DEFAULT '',
  p_email text DEFAULT ''
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

  INSERT INTO public.companies (
    name, description, category, latitude, longitude, address, is_featured, phone, email
  )
  VALUES (
    trim(p_name),
    coalesce(p_description, ''),
    trim(p_category),
    p_latitude,
    p_longitude,
    trim(p_address),
    coalesce(p_is_featured, false),
    coalesce(trim(p_phone), ''),
    lower(trim(coalesce(p_email, '')))
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_company(text, text, text, double precision, double precision, text, boolean, text, text) TO authenticated;
