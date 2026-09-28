-- Firma başvurusu: user_id unique yoksa ON CONFLICT patlar.
-- Kök çözüm: tekil indeks + CONFLICT kullanmayan submit + yönetici anlık bildirimi.

DELETE FROM public.businesses a
USING public.businesses b
WHERE a.user_id = b.user_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_key ON public.businesses (user_id);

ALTER TABLE public.app_notices DROP CONSTRAINT IF EXISTS app_notices_audience_check;
ALTER TABLE public.app_notices
  ADD CONSTRAINT app_notices_audience_check
  CHECK (audience IN ('all', 'users', 'merchants', 'admin'));

CREATE OR REPLACE FUNCTION public.notify_admins_new_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_notices (title, body, from_kind, from_name, audience)
  VALUES (
    'Yeni firma başvurusu',
    trim(NEW.company_name) || ' onay bekliyor.',
    'admin',
    'QapLA',
    'admin'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_insert_notify ON public.businesses;
CREATE TRIGGER on_business_insert_notify
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_new_business();

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
    status = CASE WHEN status = 'approved' THEN status ELSE 'pending' END
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN v_row;
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
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_business(text, text, text, text, text, text, text, text) TO authenticated;

DROP POLICY IF EXISTS "Businesses insert own pending" ON public.businesses;
CREATE POLICY "Businesses insert own pending"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Businesses update own pending" ON public.businesses;
CREATE POLICY "Businesses update own pending"
  ON public.businesses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notices;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
