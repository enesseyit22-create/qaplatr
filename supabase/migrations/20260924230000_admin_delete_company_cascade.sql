-- Firma silinirken bağlı kampanya, kupon, takip ve diğer satırlar aynı işlemde kalkar.

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_deleted boolean := false;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'Bu işlem için yönetici yetkisi gerekir.' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Firma kimliği boş.' USING ERRCODE = '22023';
  END IF;

  SELECT c.id INTO v_company FROM public.companies c WHERE c.id = p_company_id;
  IF v_company IS NULL THEN
    BEGIN
      SELECT b.company_id INTO v_company
      FROM public.businesses b
      WHERE b.id = p_company_id AND b.company_id IS NOT NULL;
    EXCEPTION
      WHEN undefined_table OR undefined_column THEN
        v_company := NULL;
    END;
  END IF;

  IF v_company IS NOT NULL THEN
    BEGIN
      DELETE FROM public.user_redemptions
      WHERE campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.coupon_tickets
      WHERE company_id = v_company
         OR campaign_id IN (SELECT id FROM public.campaigns WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.campaigns WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.follows WHERE business_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.follows WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.post_likes
      WHERE post_id IN (SELECT id FROM public.posts WHERE company_id = v_company);
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.posts WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.stories WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.story_permissions WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.company_push_tokens WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      UPDATE public.device_push_tokens SET company_id = NULL WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.push_outbox WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.app_notices WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      UPDATE public.profiles SET company_id = NULL, role = CASE WHEN role = 'merchant' THEN 'user' ELSE role END
      WHERE company_id = v_company;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    BEGIN
      DELETE FROM public.businesses WHERE company_id = v_company OR id = p_company_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    DELETE FROM public.companies WHERE id = v_company;
    v_deleted := FOUND;
  ELSE
    BEGIN
      DELETE FROM public.businesses WHERE id = p_company_id;
      v_deleted := FOUND;
    EXCEPTION WHEN undefined_table THEN
      v_deleted := false;
    END;
  END IF;

  IF NOT v_deleted THEN
    RAISE EXCEPTION 'Firma kaydı bulunamadı.' USING ERRCODE = 'P0002';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated;
