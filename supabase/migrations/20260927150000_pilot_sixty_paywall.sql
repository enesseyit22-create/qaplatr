-- Pilot bitişi 60 gündür. Ücretli plan, süresi dolan pilot ve aboneliğe alınmış yeni firmalar için açılır.

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
