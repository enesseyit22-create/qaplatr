-- Yönetim paneli anlık senkron: admin tüm başvuruları okusun, realtime yayın açık olsun.

CREATE OR REPLACE FUNCTION public.admin_list_businesses()
RETURNS SETOF public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT *
    FROM public.businesses
    ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_businesses() TO authenticated;

DROP POLICY IF EXISTS "Businesses select own or admin" ON public.businesses;
CREATE POLICY "Businesses select own or admin"
  ON public.businesses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_admin());

ALTER TABLE public.businesses REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
