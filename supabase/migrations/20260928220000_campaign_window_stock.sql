-- Kampanya 24 saat sonra arşive düşer. Kupon kullanımı stoku bir azaltır.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.archive_expired_campaigns()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.campaigns
  SET is_active = false
  WHERE coalesce(is_active, false) = true
    AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_expired_campaigns() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.campaigns_force_day_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  NEW.duration_type := 'countdown';
  NEW.duration_hours := 24;
  NEW.expiry_date := (NEW.created_at + interval '24 hours')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_force_day_window ON public.campaigns;
CREATE TRIGGER campaigns_force_day_window
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.campaigns_force_day_window();

CREATE OR REPLACE FUNCTION public.guard_campaign_redeem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
  v_created timestamptz;
  v_active boolean;
BEGIN
  SELECT stock, created_at, is_active
  INTO v_stock, v_created, v_active
  FROM public.campaigns
  WHERE id = NEW.campaign_id
  FOR UPDATE;

  IF NOT FOUND OR coalesce(v_active, false) = false THEN
    RAISE EXCEPTION 'Kampanya aktif değil';
  END IF;
  IF v_created IS NOT NULL AND v_created < now() - interval '24 hours' THEN
    UPDATE public.campaigns SET is_active = false WHERE id = NEW.campaign_id;
    RAISE EXCEPTION 'Kampanyanın süresi doldu';
  END IF;
  IF coalesce(v_stock, 0) <= 0 THEN
    RAISE EXCEPTION 'Stok tükendi';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_redeem_guard ON public.user_redemptions;
CREATE TRIGGER campaign_redeem_guard
  BEFORE INSERT ON public.user_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_campaign_redeem();

CREATE OR REPLACE FUNCTION public.decrement_campaign_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer;
BEGIN
  UPDATE public.campaigns
  SET stock = GREATEST(0, coalesce(stock, 0) - 1)
  WHERE id = NEW.campaign_id
  RETURNING stock INTO v_left;

  IF v_left IS NOT NULL AND v_left <= 0 THEN
    UPDATE public.campaigns SET is_active = false WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_stock_on_redeem ON public.user_redemptions;
CREATE TRIGGER campaign_stock_on_redeem
  AFTER INSERT ON public.user_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_campaign_stock();

CREATE OR REPLACE FUNCTION public.admin_set_member_vip(p_profile uuid, p_vip boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET vip = coalesce(p_vip, false) WHERE id = p_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_member_vip(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_member_vip(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_company_term(p_company uuid, p_ends_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies SET subscription_ends_at = p_ends_at WHERE id = p_company;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_company_term(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_company_term(uuid, timestamptz) TO authenticated;
