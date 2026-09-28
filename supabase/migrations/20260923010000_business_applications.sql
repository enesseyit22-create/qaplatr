/*
  Firma başvuruları: businesses (status pending | approved | rejected)
  Onayda companies + profiles.role = merchant bağlanır.
*/

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  owner_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  company_name text NOT NULL,
  sector text NOT NULL,
  district text NOT NULL,
  address text NOT NULL,
  tax_office text NOT NULL DEFAULT '',
  tax_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS businesses_status_idx ON public.businesses (status, created_at DESC);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Businesses select own or admin" ON public.businesses;
CREATE POLICY "Businesses select own or admin"
  ON public.businesses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "Businesses insert own pending" ON public.businesses;
CREATE POLICY "Businesses insert own pending"
  ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Businesses update admin only" ON public.businesses;
CREATE POLICY "Businesses update admin only"
  ON public.businesses FOR UPDATE TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Businesses delete admin only" ON public.businesses;
CREATE POLICY "Businesses delete admin only"
  ON public.businesses FOR DELETE TO authenticated
  USING (public.is_current_admin());

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

  IF p_status = 'approved' AND v_row.company_id IS NULL THEN
    INSERT INTO public.companies (
      name, description, category, latitude, longitude, address, is_featured, phone, email, owner_email
    )
    VALUES (
      trim(v_row.company_name),
      trim(v_row.district) || ' / ' || trim(v_row.sector),
      trim(v_row.sector),
      coalesce(p_latitude, 40.1956),
      coalesce(p_longitude, 29.0601),
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

GRANT EXECUTE ON FUNCTION public.admin_set_business_status(uuid, text, double precision, double precision) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
