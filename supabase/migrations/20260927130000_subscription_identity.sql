-- Abonelik ayarları ve firma profilindeki vergi/TC ile kampanya fiyat kaydı.

ALTER TABLE public.app_live_settings
  ADD COLUMN IF NOT EXISTS is_subscription_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS intro_price integer NOT NULL DEFAULT 199,
  ADD COLUMN IF NOT EXISTS intro_duration_months integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS standard_price integer NOT NULL DEFAULT 599;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS identity_kind text,
  ADD COLUMN IF NOT EXISTS subscription_enrolled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS intro_price integer,
  ADD COLUMN IF NOT EXISTS intro_duration_months integer,
  ADD COLUMN IF NOT EXISTS standard_price integer;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_identity_kind_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_identity_kind_check
  CHECK (identity_kind IS NULL OR identity_kind IN ('tax', 'national'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS identity_kind text,
  ADD COLUMN IF NOT EXISTS subscription_enrolled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS intro_price integer,
  ADD COLUMN IF NOT EXISTS intro_duration_months integer,
  ADD COLUMN IF NOT EXISTS standard_price integer;

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_identity_kind_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_identity_kind_check
  CHECK (identity_kind IS NULL OR identity_kind IN ('tax', 'national'));

CREATE OR REPLACE FUNCTION public.enroll_business_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.app_live_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.app_live_settings WHERE id = 'main';
  IF coalesce(v_settings.is_subscription_active, false) THEN
    NEW.subscription_enrolled := true;
    NEW.subscription_started_at := coalesce(NEW.subscription_started_at, now());
    NEW.intro_price := coalesce(v_settings.intro_price, 199);
    NEW.intro_duration_months := coalesce(v_settings.intro_duration_months, 3);
    NEW.standard_price := coalesce(v_settings.standard_price, 599);
  ELSE
    NEW.subscription_enrolled := false;
    NEW.subscription_started_at := NULL;
    NEW.intro_price := NULL;
    NEW.intro_duration_months := NULL;
    NEW.standard_price := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_enroll_subscription ON public.businesses;
CREATE TRIGGER businesses_enroll_subscription
  BEFORE INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.enroll_business_subscription();

CREATE OR REPLACE FUNCTION public.admin_set_business_status(
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
      coalesce(v_row.subscription_enrolled, false),
      v_row.subscription_started_at,
      v_row.intro_price,
      v_row.intro_duration_months,
      v_row.standard_price
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
      subscription_enrolled = coalesce(v_row.subscription_enrolled, subscription_enrolled),
      subscription_started_at = coalesce(v_row.subscription_started_at, subscription_started_at),
      intro_price = coalesce(v_row.intro_price, intro_price),
      intro_duration_months = coalesce(v_row.intro_duration_months, intro_duration_months),
      standard_price = coalesce(v_row.standard_price, standard_price)
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
