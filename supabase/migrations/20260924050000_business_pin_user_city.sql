-- İşletme başvurusu harita pini + kullanıcı şehir alanı.
-- Onayda companies koordinatı başvurudaki lat/lng olur.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text;

DROP FUNCTION IF EXISTS public.submit_my_business(text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_my_business(
  p_owner_name text,
  p_phone text,
  p_company_name text,
  p_sector text,
  p_district text,
  p_address text,
  p_tax_office text,
  p_tax_number text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_row public.businesses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_email = '' THEN
    SELECT lower(trim(email)) INTO v_email
    FROM public.profiles
    WHERE id = v_uid OR auth_user_id = v_uid
    LIMIT 1;
  END IF;
  v_email := coalesce(nullif(v_email, ''), 'unknown@qapla.local');

  UPDATE public.businesses
  SET
    email = v_email,
    owner_name = trim(p_owner_name),
    phone = coalesce(trim(p_phone), ''),
    company_name = trim(p_company_name),
    sector = trim(p_sector),
    district = trim(p_district),
    address = trim(p_address),
    tax_office = trim(p_tax_office),
    tax_number = trim(p_tax_number),
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    status = CASE WHEN status = 'approved' THEN status ELSE 'pending' END
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.businesses (
    user_id, email, owner_name, phone, company_name, sector, district, address,
    tax_office, tax_number, latitude, longitude, status
  )
  VALUES (
    v_uid,
    v_email,
    trim(p_owner_name),
    coalesce(trim(p_phone), ''),
    trim(p_company_name),
    trim(p_sector),
    trim(p_district),
    trim(p_address),
    trim(p_tax_office),
    trim(p_tax_number),
    p_latitude,
    p_longitude,
    'pending'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_my_business(text, text, text, text, text, text, text, text, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_business_status(
  p_id uuid,
  p_status text,
  p_latitude double precision DEFAULT 40.1956,
  p_longitude double precision DEFAULT 29.0601
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.businesses;
  v_company public.companies;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.businesses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  v_lat := coalesce(v_row.latitude, p_latitude, 40.1956);
  v_lng := coalesce(v_row.longitude, p_longitude, 29.0601);

  IF p_status = 'approved' AND v_row.company_id IS NULL THEN
    INSERT INTO public.companies (
      name, description, category, latitude, longitude, address, is_featured, phone, email, owner_email
    )
    VALUES (
      trim(v_row.company_name),
      trim(v_row.district) || ' / ' || trim(v_row.sector),
      trim(v_row.sector),
      v_lat,
      v_lng,
      trim(v_row.address),
      false,
      coalesce(trim(v_row.phone), ''),
      lower(trim(v_row.email)),
      lower(trim(v_row.email))
    )
    RETURNING * INTO v_company;

    UPDATE public.profiles
    SET
      role = 'merchant',
      company_id = v_company.id,
      phone = CASE WHEN coalesce(trim(phone), '') = '' THEN v_row.phone ELSE phone END,
      full_name = coalesce(nullif(trim(full_name), ''), v_row.owner_name)
    WHERE id = v_row.user_id OR auth_user_id = v_row.user_id;

    v_row.company_id := v_company.id;
  ELSIF p_status = 'approved' AND v_row.company_id IS NOT NULL THEN
    UPDATE public.companies
    SET
      latitude = v_lat,
      longitude = v_lng,
      address = coalesce(nullif(trim(v_row.address), ''), address)
    WHERE id = v_row.company_id;
  END IF;

  UPDATE public.businesses
  SET
    status = p_status,
    company_id = coalesce(v_row.company_id, company_id),
    reviewed_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_my_profile(text, text, text, text);

CREATE OR REPLACE FUNCTION public.complete_my_profile(
  p_email text,
  p_phone text DEFAULT '',
  p_full_name text DEFAULT '',
  p_role text DEFAULT 'user',
  p_city text DEFAULT ''
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := CASE WHEN p_role IN ('user', 'merchant') THEN p_role ELSE 'user' END;
  v_city text := nullif(trim(p_city), '');
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    auth_user_id = v_uid,
    email = lower(trim(p_email)),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    city = coalesce(v_city, city),
    role = CASE
      WHEN public.profiles.role IN ('admin', 'merchant') THEN public.profiles.role
      ELSE v_role
    END
  WHERE id = v_uid OR auth_user_id = v_uid
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, auth_user_id, email, phone, full_name, role, city)
    VALUES (v_uid, v_uid, lower(trim(p_email)), coalesce(trim(p_phone), ''), nullif(trim(p_full_name), ''), v_role, v_city)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.profiles
    SET
      auth_user_id = v_uid,
      email = lower(trim(p_email)),
      phone = coalesce(nullif(trim(p_phone), ''), phone),
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      city = coalesce(v_city, city)
    WHERE id = v_uid OR auth_user_id = v_uid
    RETURNING * INTO v_row;
  END;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_my_profile(text, text, text, text, text) TO authenticated;
