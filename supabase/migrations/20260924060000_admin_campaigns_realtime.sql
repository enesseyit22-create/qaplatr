-- Yönetim kampanya silme + realtime pin yayını.

CREATE OR REPLACE FUNCTION public.admin_delete_campaign(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.campaigns WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_campaign(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_delete_campaign(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company
  FROM public.profiles
  WHERE id = v_uid OR auth_user_id = v_uid
  LIMIT 1;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.campaigns
  WHERE id = p_id AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_delete_campaign(uuid) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
