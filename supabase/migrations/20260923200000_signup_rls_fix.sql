ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR auth_user_id = auth.uid()
    OR public.is_current_admin()
  );

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR auth_user_id = auth.uid())
  WITH CHECK (id = auth.uid() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Businesses insert own pending" ON public.businesses;
CREATE POLICY "Businesses insert own pending"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Businesses update own pending" ON public.businesses;
CREATE POLICY "Businesses update own pending"
  ON public.businesses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.bootstrap_role(NEW.email);
  v_company uuid;
  v_name text := nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), '');
BEGIN
  SELECT id INTO v_company
  FROM public.companies
  WHERE lower(trim(coalesce(owner_email, ''))) = lower(trim(coalesce(NEW.email, '')))
  LIMIT 1;

  INSERT INTO public.profiles (id, auth_user_id, email, phone, role, company_id, full_name)
  VALUES (
    NEW.id,
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(NEW.raw_user_meta_data->>'phone', ''),
    v_role,
    CASE WHEN v_role = 'merchant' THEN v_company ELSE NULL END,
    v_name
  )
  ON CONFLICT (id) DO UPDATE
    SET auth_user_id = excluded.auth_user_id,
        email = excluded.email,
        phone = CASE
          WHEN excluded.phone IS NULL OR excluded.phone = '' THEN public.profiles.phone
          ELSE excluded.phone
        END,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        role = CASE
          WHEN public.profiles.role IN ('admin', 'merchant') THEN public.profiles.role
          ELSE excluded.role
        END,
        company_id = coalesce(public.profiles.company_id, excluded.company_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_my_profile(
  p_email text,
  p_phone text DEFAULT '',
  p_full_name text DEFAULT '',
  p_role text DEFAULT 'user'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := CASE WHEN p_role IN ('user', 'merchant') THEN p_role ELSE 'user' END;
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
    INSERT INTO public.profiles (id, auth_user_id, email, phone, full_name, role)
    VALUES (v_uid, v_uid, lower(trim(p_email)), coalesce(trim(p_phone), ''), nullif(trim(p_full_name), ''), v_role)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.profiles
    SET
      auth_user_id = v_uid,
      email = lower(trim(p_email)),
      phone = coalesce(nullif(trim(p_phone), ''), phone),
      full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
    WHERE id = v_uid OR auth_user_id = v_uid
    RETURNING * INTO v_row;
  END;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_business(
  p_owner_name text,
  p_phone text,
  p_company_name text,
  p_sector text,
  p_district text,
  p_address text,
  p_tax_office text,
  p_tax_number text
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

  INSERT INTO public.businesses (
    user_id, email, owner_name, phone, company_name, sector, district, address, tax_office, tax_number, status
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
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      owner_name = excluded.owner_name,
      phone = excluded.phone,
      company_name = excluded.company_name,
      sector = excluded.sector,
      district = excluded.district,
      address = excluded.address,
      tax_office = excluded.tax_office,
      tax_number = excluded.tax_number,
      email = excluded.email,
      status = CASE WHEN public.businesses.status = 'approved' THEN public.businesses.status ELSE 'pending' END
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;

GRANT EXECUTE ON FUNCTION public.complete_my_profile(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_business(text, text, text, text, text, text, text, text) TO authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_auth();
