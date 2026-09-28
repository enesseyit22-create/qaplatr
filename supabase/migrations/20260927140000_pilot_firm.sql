-- Pilot firma: 2 ay ücretsiz, bitiş tarihi kayıt anından 2 ay sonra.
-- Süre dolunca merchant_start_paid_plan ücretli dönemi başlatır.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_pilot_firm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_trial_months integer,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_started_at timestamptz;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_pilot_firm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_trial_months integer,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_started_at timestamptz;

DROP FUNCTION IF EXISTS public.admin_set_business_status(uuid, text, double precision, double precision);

CREATE OR REPLACE FUNCTION public.admin_set_business_status(
  p_id uuid,
  p_status text,
  p_latitude double precision,
  p_longitude double precision,
  p_pilot boolean DEFAULT false
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
  v_pilot boolean;
  v_trial_end timestamptz;
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
  v_pilot := p_status = 'approved' AND coalesce(p_pilot, false);
  v_trial_end := CASE WHEN v_pilot THEN now() + interval '60 days' ELSE NULL END;

  IF p_status = 'approved' AND v_company_id IS NULL THEN
    INSERT INTO public.companies (
      name, description, category, latitude, longitude, address, is_featured, phone, email, owner_email,
      tax_number, identity_kind, subscription_enrolled, subscription_started_at, intro_price, intro_duration_months, standard_price
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
      lower(trim(v_row.email)),
      nullif(trim(coalesce(v_row.tax_number, '')), ''),
      v_row.identity_kind,
      CASE WHEN v_pilot THEN false ELSE coalesce(v_row.subscription_enrolled, false) END,
      CASE WHEN v_pilot THEN NULL ELSE v_row.subscription_started_at END,
      CASE WHEN v_pilot THEN NULL ELSE v_row.intro_price END,
      CASE WHEN v_pilot THEN NULL ELSE v_row.intro_duration_months END,
      CASE WHEN v_pilot THEN NULL ELSE v_row.standard_price END
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
      address = coalesce(nullif(trim(v_row.address), ''), address),
      tax_number = coalesce(nullif(trim(coalesce(v_row.tax_number, '')), ''), tax_number),
      identity_kind = coalesce(v_row.identity_kind, identity_kind),
      subscription_enrolled = CASE WHEN v_pilot THEN false ELSE coalesce(v_row.subscription_enrolled, subscription_enrolled) END,
      subscription_started_at = CASE WHEN v_pilot THEN NULL ELSE coalesce(v_row.subscription_started_at, subscription_started_at) END,
      intro_price = CASE WHEN v_pilot THEN NULL ELSE coalesce(v_row.intro_price, intro_price) END,
      intro_duration_months = CASE WHEN v_pilot THEN NULL ELSE coalesce(v_row.intro_duration_months, intro_duration_months) END,
      standard_price = CASE WHEN v_pilot THEN NULL ELSE coalesce(v_row.standard_price, standard_price) END
    WHERE id = v_company_id;
  END IF;

  IF v_pilot AND v_company_id IS NOT NULL THEN
    UPDATE public.companies
    SET
      is_pilot_firm = true,
      free_trial_months = 2,
      subscription_ends_at = v_trial_end,
      paid_started_at = NULL,
      subscription_enrolled = false
    WHERE id = v_company_id;
  END IF;

  UPDATE public.businesses
  SET
    status = p_status,
    company_id = coalesce(v_company_id, company_id),
    reviewed_at = now(),
    is_pilot_firm = CASE WHEN v_pilot THEN true ELSE is_pilot_firm END,
    free_trial_months = CASE WHEN v_pilot THEN 2 ELSE free_trial_months END,
    subscription_ends_at = CASE WHEN v_pilot THEN v_trial_end ELSE subscription_ends_at END,
    paid_started_at = CASE WHEN v_pilot THEN NULL ELSE paid_started_at END,
    subscription_enrolled = CASE WHEN v_pilot THEN false ELSE subscription_enrolled END,
    subscription_started_at = CASE WHEN v_pilot THEN NULL ELSE subscription_started_at END
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_business_status(uuid, text, double precision, double precision, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_business_status(uuid, text, double precision, double precision, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_start_paid_plan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_company public.companies;
  v_settings public.app_live_settings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_uid OR p.auth_user_id = v_uid
  ORDER BY p.company_id NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT b.company_id INTO v_company_id
    FROM public.businesses b
    WHERE b.user_id = v_uid AND b.status = 'approved' AND b.company_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_company.paid_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF coalesce(v_company.is_pilot_firm, false) THEN
    IF v_company.subscription_ends_at IS NULL OR v_company.subscription_ends_at > now() THEN
      RAISE EXCEPTION 'trial_active' USING ERRCODE = '22023';
    END IF;
  ELSIF NOT coalesce(v_company.subscription_enrolled, false) THEN
    RAISE EXCEPTION 'not_enrolled' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings FROM public.app_live_settings WHERE id = 'main';

  UPDATE public.companies
  SET
    subscription_enrolled = true,
    subscription_started_at = now(),
    paid_started_at = now(),
    intro_price = coalesce(v_settings.intro_price, 199),
    intro_duration_months = coalesce(v_settings.intro_duration_months, 3),
    standard_price = coalesce(v_settings.standard_price, 599)
  WHERE id = v_company_id;

  UPDATE public.businesses
  SET
    subscription_enrolled = true,
    subscription_started_at = now(),
    paid_started_at = now(),
    intro_price = coalesce(v_settings.intro_price, 199),
    intro_duration_months = coalesce(v_settings.intro_duration_months, 3),
    standard_price = coalesce(v_settings.standard_price, 599)
  WHERE company_id = v_company_id OR user_id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.merchant_start_paid_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_start_paid_plan() TO authenticated;
