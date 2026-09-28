-- Kupon oluşturma/silme ve "silindi" bildirimleri kapanır; yönetim dışı bildirimler 2 saatte silinir.
-- Kupon onaylandığı anda stok bir düşer; onay zamanı ve onaylayan kaydedilir.

ALTER TABLE public.app_notices ADD COLUMN IF NOT EXISTS expires_at timestamptz;
CREATE INDEX IF NOT EXISTS app_notices_expires_idx ON public.app_notices (expires_at) WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.app_notices_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.audience = 'admin' THEN
    NEW.expires_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.expires_at IS NULL AND (
    (NEW.audience = 'merchants' AND NEW.company_id IS NOT NULL AND NEW.title ILIKE 'Yeni takip%')
    OR NOT public.is_current_admin()
  ) THEN
    NEW.expires_at := coalesce(NEW.created_at, now()) + interval '2 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_notices_set_expiry ON public.app_notices;
CREATE TRIGGER app_notices_set_expiry
  BEFORE INSERT ON public.app_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.app_notices_set_expiry();

UPDATE public.app_notices
SET expires_at = created_at + interval '2 hours'
WHERE expires_at IS NULL
  AND audience = 'merchants'
  AND company_id IS NOT NULL
  AND title ILIKE 'Yeni takip%';

CREATE OR REPLACE FUNCTION public.purge_expired_notices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  DELETE FROM public.app_notices
  WHERE expires_at IS NOT NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_notices() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_notices_purge_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purge_expired_notices();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS app_notices_purge_after_insert ON public.app_notices;
CREATE TRIGGER app_notices_purge_after_insert
  AFTER INSERT ON public.app_notices
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.app_notices_purge_after_insert();

SELECT public.purge_expired_notices();

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    EXECUTE $job$SELECT cron.schedule('qapla-purge-notices', '*/10 * * * *', 'SELECT public.purge_expired_notices()')$job$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Bildirim temizliği zamanlanamadı: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_coupon_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NEW.status IS DISTINCT FROM 'used' OR OLD.status IS NOT DISTINCT FROM 'used' OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(c.name), ''), 'Firma') INTO v_name
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'coupon_update',
    'Kupon onaylandı',
    coalesce(v_name, 'Firma') || ' kuponunu onayladı.',
    NULL,
    jsonb_build_object('couponId', NEW.id, 'userId', NEW.user_id, 'status', NEW.status)
  );

  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.company_id IS NULL OR coalesce(NEW.is_active, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.is_active, false) IS TRUE
      AND NEW.title IS NOT DISTINCT FROM OLD.title
      AND NEW.discount_rate IS NOT DISTINCT FROM OLD.discount_rate
      AND NEW.details IS NOT DISTINCT FROM OLD.details
      AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN
      RETURN NEW;
    END IF;
    v_kind := 'campaign_update';
  ELSE
    v_kind := 'campaign';
  END IF;

  SELECT coalesce(nullif(trim(c.name), ''), 'Firma') INTO v_name
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    v_kind,
    coalesce(nullif(trim(NEW.title), ''), 'Kampanya'),
    coalesce(v_name, 'Firma') || CASE WHEN v_kind = 'campaign' THEN ' yeni bir kampanya paylaştı.' ELSE ' kampanyasını güncelledi.' END,
    NEW.company_id,
    jsonb_build_object('campaignId', NEW.id, 'companyId', NEW.company_id)
  );

  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

DELETE FROM public.push_outbox
WHERE sent_at IS NULL
  AND (
    kind IN ('coupon', 'coupon_delete', 'campaign_delete')
    OR (kind = 'coupon_update' AND coalesce(payload->>'status', '') <> 'used')
  );

ALTER TABLE public.coupon_tickets ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.coupon_tickets ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_redemptions ADD COLUMN IF NOT EXISTS used_at timestamptz;

CREATE INDEX IF NOT EXISTS coupon_tickets_campaign_status_idx ON public.coupon_tickets (campaign_id, status);
CREATE INDEX IF NOT EXISTS coupon_tickets_company_used_idx ON public.coupon_tickets (company_id, used_at DESC) WHERE status = 'used';
CREATE INDEX IF NOT EXISTS user_redemptions_campaign_time_idx ON public.user_redemptions (campaign_id, redeemed_at DESC);

UPDATE public.coupon_tickets t
SET stock_applied = true
WHERE t.stock_applied = false
  AND (
    t.status = 'used'
    OR (t.status = 'active' AND EXISTS (SELECT 1 FROM public.user_redemptions r WHERE r.id = t.id))
  );

UPDATE public.user_redemptions r
SET used_at = t.used_at
FROM public.coupon_tickets t
WHERE t.id = r.id
  AND t.status = 'used'
  AND t.used_at IS NOT NULL
  AND r.used_at IS NULL;

DROP TRIGGER IF EXISTS campaign_stock_on_redeem ON public.user_redemptions;

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
  v_held integer := 0;
  v_pending integer := 0;
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

  SELECT count(*)::integer INTO v_held
  FROM public.coupon_tickets t
  WHERE t.campaign_id = NEW.campaign_id
    AND t.status = 'active'
    AND NOT t.stock_applied
    AND coalesce(t.expires_at, t.created_at + interval '2 hours') > now();

  SELECT count(*)::integer INTO v_pending
  FROM public.user_redemptions r
  WHERE r.campaign_id = NEW.campaign_id
    AND r.redeemed_at > now() - interval '2 hours'
    AND NOT EXISTS (SELECT 1 FROM public.coupon_tickets t WHERE t.id = r.id);

  IF v_stock - v_held - v_pending <= 0 THEN
    RAISE EXCEPTION 'Kalan kuponların hepsi şu an ayrılmış. Biraz sonra tekrar dene.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.coupon_ticket_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin boolean := public.is_current_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stock_applied := NEW.status = 'used';
    IF NEW.status = 'used' THEN
      NEW.used_at := now();
      NEW.approved_by := coalesce(auth.uid(), NEW.approved_by);
    ELSE
      NEW.used_at := NULL;
      NEW.approved_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'used' THEN
    IF NEW.status IS DISTINCT FROM 'used' AND NOT v_admin THEN
      RAISE EXCEPTION 'Kullanılmış kupon değiştirilemez.' USING ERRCODE = 'P0001';
    END IF;
    NEW.used_at := OLD.used_at;
    NEW.approved_by := OLD.approved_by;
    NEW.stock_applied := OLD.stock_applied;
    RETURN NEW;
  END IF;

  IF NEW.status = 'used' THEN
    IF NOT v_admin THEN
      IF OLD.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Kupon geçersiz.' USING ERRCODE = 'P0001';
      END IF;
      IF OLD.expires_at IS NOT NULL AND OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'Kuponun süresi dolmuş.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    NEW.used_at := now();
    NEW.approved_by := coalesce(auth.uid(), OLD.approved_by);
    NEW.stock_applied := true;
  ELSE
    NEW.used_at := OLD.used_at;
    NEW.approved_by := OLD.approved_by;
    NEW.stock_applied := OLD.stock_applied;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupon_ticket_guard ON public.coupon_tickets;
CREATE TRIGGER coupon_ticket_guard
  BEFORE INSERT OR UPDATE ON public.coupon_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.coupon_ticket_guard();

CREATE OR REPLACE FUNCTION public.coupon_ticket_consume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'used' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'used' THEN
    RETURN NEW;
  END IF;

  IF NEW.campaign_id IS NOT NULL AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.stock_applied, false)) THEN
    UPDATE public.campaigns
    SET stock = GREATEST(0, coalesce(stock, 0) - 1)
    WHERE id = NEW.campaign_id
    RETURNING stock INTO v_left;

    IF v_left IS NOT NULL AND v_left <= 0 THEN
      UPDATE public.campaigns SET is_active = false WHERE id = NEW.campaign_id AND is_active;
    END IF;
  END IF;

  UPDATE public.user_redemptions
  SET used_at = NEW.used_at
  WHERE id = NEW.id AND used_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupon_ticket_consume ON public.coupon_tickets;
CREATE TRIGGER coupon_ticket_consume
  AFTER INSERT OR UPDATE OF status ON public.coupon_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.coupon_ticket_consume();
