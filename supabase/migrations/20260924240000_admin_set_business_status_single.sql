-- businesses.company_id canlı tabloda yoktu; v_row.company_id "record has no field" veriyordu.
-- Sütunu ekle, eski imzaları düşür, onay fonksiyonunu tek imzayla yeniden kur.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_company_idx ON public.businesses (company_id);

UPDATE public.businesses b
SET company_id = p.company_id
FROM public.profiles p
WHERE b.company_id IS NULL
  AND p.company_id IS NOT NULL
  AND (p.id = b.user_id OR p.auth_user_id = b.user_id);

UPDATE public.businesses b
SET company_id = c.id
FROM public.companies c
WHERE b.company_id IS NULL
  AND lower(trim(c.owner_email)) = lower(trim(b.email));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_set_business_status'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

CREATE FUNCTION public.admin_set_business_status(
  p_id uuid,
  p_status text,
  p_latitude double precision,
  p_longitude double precision
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.businesses;
  v_company public.companies;
  v_company_id uuid;
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

  SELECT b.company_id INTO v_company_id
  FROM public.businesses b
  WHERE b.id = p_id;

  v_lat := coalesce(v_row.latitude, p_latitude, 40.1956);
  v_lng := coalesce(v_row.longitude, p_longitude, 29.0601);

  IF p_status = 'approved' AND v_company_id IS NULL THEN
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

    v_company_id := v_company.id;

    UPDATE public.profiles
    SET
      role = 'merchant',
      company_id = v_company_id,
      phone = CASE WHEN coalesce(trim(phone), '') = '' THEN v_row.phone ELSE phone END,
      full_name = coalesce(nullif(trim(full_name), ''), v_row.owner_name)
    WHERE id = v_row.user_id OR auth_user_id = v_row.user_id;
  ELSIF p_status = 'approved' AND v_company_id IS NOT NULL THEN
    UPDATE public.companies
    SET
      latitude = v_lat,
      longitude = v_lng,
      address = coalesce(nullif(trim(v_row.address), ''), address)
    WHERE id = v_company_id;
  END IF;

  UPDATE public.businesses
  SET
    status = p_status,
    company_id = coalesce(v_company_id, company_id),
    reviewed_at = now()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_business_status(uuid, text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_business_status(uuid, text, double precision, double precision) TO authenticated;
