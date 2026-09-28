/*
# Kampanya altyapısı: companies, campaigns, user_redemptions

1. Tablolar
- companies: işletme / firma kaydı (konum, kategori, öne çıkan).
- campaigns: firmaya bağlı kampanya (indirim oranı, son tarih, aktiflik).
- user_redemptions: kullanıcı-kampanya kullanım kayıtları.

2. Kurallar
- Aynı kullanıcı aynı kampanyayı yalnızca 1 kez kullanabilir (UNIQUE user_id + campaign_id).
- Herhangi bir kullanımdan sonra 3 saat genel cooldown uygulanır.
- Kontroller SECURITY DEFINER RPC ile atomik yapılır; tabloya doğrudan INSERT kapalıdır.
*/

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  discount_rate numeric(5, 2) NOT NULL CHECK (discount_rate > 0 AND discount_rate <= 100),
  expiry_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_redemptions_one_per_campaign UNIQUE (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS companies_featured_idx ON public.companies (is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_company_idx ON public.campaigns (company_id);
CREATE INDEX IF NOT EXISTS campaigns_active_expiry_idx ON public.campaigns (is_active, expiry_date);
CREATE INDEX IF NOT EXISTS user_redemptions_user_time_idx ON public.user_redemptions (user_id, redeemed_at DESC);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read companies" ON public.companies;
CREATE POLICY "Public can read companies"
  ON public.companies FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Companies inserts locked" ON public.companies;
CREATE POLICY "Companies inserts locked"
  ON public.companies FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Companies updates locked" ON public.companies;
CREATE POLICY "Companies updates locked"
  ON public.companies FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Companies deletes locked" ON public.companies;
CREATE POLICY "Companies deletes locked"
  ON public.companies FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Public can read campaigns" ON public.campaigns;
CREATE POLICY "Public can read campaigns"
  ON public.campaigns FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Campaigns writes locked" ON public.campaigns;
CREATE POLICY "Campaigns writes locked"
  ON public.campaigns FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Campaigns updates locked" ON public.campaigns;
CREATE POLICY "Campaigns updates locked"
  ON public.campaigns FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Campaigns deletes locked" ON public.campaigns;
CREATE POLICY "Campaigns deletes locked"
  ON public.campaigns FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Authenticated users read own redemptions" ON public.user_redemptions;
CREATE POLICY "Authenticated users read own redemptions"
  ON public.user_redemptions FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Redemptions insert only via rpc" ON public.user_redemptions;
CREATE POLICY "Redemptions insert only via rpc"
  ON public.user_redemptions FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Redemptions cannot be updated" ON public.user_redemptions;
CREATE POLICY "Redemptions cannot be updated"
  ON public.user_redemptions FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Redemptions cannot be deleted" ON public.user_redemptions;
CREATE POLICY "Redemptions cannot be deleted"
  ON public.user_redemptions FOR DELETE TO anon, authenticated USING (false);

CREATE OR REPLACE FUNCTION public.resolve_redemption_user_id(p_user_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_auth text;
BEGIN
  v_auth := auth.uid()::text;
  IF v_auth IS NOT NULL THEN
    RETURN v_auth;
  END IF;
  IF p_user_id IS NULL OR length(trim(p_user_id)) < 8 OR length(trim(p_user_id)) > 80 THEN
    RETURN NULL;
  END IF;
  RETURN trim(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_campaign_eligibility(
  p_campaign_id uuid,
  p_user_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_campaign public.campaigns%ROWTYPE;
  v_last timestamptz;
  v_already boolean := false;
  v_cooldown_seconds integer := 0;
  v_expired boolean := false;
BEGIN
  v_user_id := public.resolve_redemption_user_id(p_user_id);

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'can_redeem', false,
      'code', 'NOT_FOUND',
      'message', 'Kampanya bulunamadı.',
      'already_redeemed', false,
      'cooldown_active', false,
      'cooldown_remaining_seconds', 0,
      'campaign_active', false,
      'campaign_expired', false
    );
  END IF;

  v_expired := v_campaign.expiry_date < CURRENT_DATE;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_redemptions
      WHERE user_id = v_user_id
        AND campaign_id = p_campaign_id
    ) INTO v_already;

    SELECT max(redeemed_at)
    INTO v_last
    FROM public.user_redemptions
    WHERE user_id = v_user_id;

    IF v_last IS NOT NULL THEN
      v_cooldown_seconds := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (v_last + interval '3 hours' - now())))::integer
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'can_redeem',
      v_user_id IS NOT NULL
      AND v_campaign.is_active
      AND NOT v_expired
      AND NOT v_already
      AND v_cooldown_seconds = 0,
    'code', CASE
      WHEN v_user_id IS NULL THEN 'MISSING_USER'
      WHEN NOT v_campaign.is_active THEN 'INACTIVE'
      WHEN v_expired THEN 'EXPIRED'
      WHEN v_already THEN 'ALREADY_REDEEMED'
      WHEN v_cooldown_seconds > 0 THEN 'COOLDOWN'
      ELSE 'OK'
    END,
    'message', CASE
      WHEN v_user_id IS NULL THEN 'Kullanıcı kimliği gerekli.'
      WHEN NOT v_campaign.is_active THEN 'Kampanya şu anda aktif değil.'
      WHEN v_expired THEN 'Kampanyanın süresi doldu.'
      WHEN v_already THEN 'Bu kampanyadan yalnızca bir kez yararlanabilirsiniz.'
      WHEN v_cooldown_seconds > 0 THEN 'Son kullanımdan sonra 3 saat beklemeniz gerekir.'
      ELSE 'Kampanya kullanılabilir.'
    END,
    'already_redeemed', v_already,
    'cooldown_active', v_cooldown_seconds > 0,
    'cooldown_remaining_seconds', v_cooldown_seconds,
    'campaign_active', v_campaign.is_active,
    'campaign_expired', v_expired
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_user_redemptions(p_user_id text DEFAULT NULL)
RETURNS SETOF public.user_redemptions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
BEGIN
  v_user_id := public.resolve_redemption_user_id(p_user_id);
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.user_redemptions
  WHERE user_id = v_user_id
  ORDER BY redeemed_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_campaign(
  p_campaign_id uuid,
  p_user_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_campaign public.campaigns%ROWTYPE;
  v_last timestamptz;
  v_row public.user_redemptions%ROWTYPE;
  v_lock_key bigint;
  v_cooldown_seconds integer := 0;
BEGIN
  v_user_id := public.resolve_redemption_user_id(p_user_id);
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MISSING_USER',
      'message', 'Kullanıcı kimliği gerekli.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
  END IF;

  v_lock_key := ('x' || substr(md5(v_user_id), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF v_campaign.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_FOUND',
      'message', 'Kampanya bulunamadı.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
  END IF;

  IF NOT v_campaign.is_active THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INACTIVE',
      'message', 'Kampanya şu anda aktif değil.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
  END IF;

  IF v_campaign.expiry_date < CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EXPIRED',
      'message', 'Kampanyanın süresi doldu.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_redemptions
    WHERE user_id = v_user_id
      AND campaign_id = p_campaign_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_REDEEMED',
      'message', 'Bu kampanyadan yalnızca bir kez yararlanabilirsiniz.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
  END IF;

  SELECT max(redeemed_at)
  INTO v_last
  FROM public.user_redemptions
  WHERE user_id = v_user_id;

  IF v_last IS NOT NULL THEN
    v_cooldown_seconds := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (v_last + interval '3 hours' - now())))::integer
    );
  END IF;

  IF v_cooldown_seconds > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'COOLDOWN',
      'message', 'Son kullanımdan sonra 3 saat boyunca başka kampanya kullanamazsınız.',
      'cooldown_remaining_seconds', v_cooldown_seconds,
      'redemption', NULL
    );
  END IF;

  INSERT INTO public.user_redemptions (user_id, campaign_id)
  VALUES (v_user_id, p_campaign_id)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'OK',
    'message', 'Kampanya kullanıldı.',
    'cooldown_remaining_seconds', 0,
    'redemption', jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'campaign_id', v_row.campaign_id,
      'redeemed_at', v_row.redeemed_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_REDEEMED',
      'message', 'Bu kampanyadan yalnızca bir kez yararlanabilirsiniz.',
      'cooldown_remaining_seconds', 0,
      'redemption', NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_campaign_eligibility(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_campaign(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_user_redemptions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_campaign_eligibility(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_campaign(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_redemptions(text) TO anon, authenticated;

INSERT INTO public.companies (name, description, category, latitude, longitude, address, is_featured)
SELECT seed.name, seed.description, seed.category, seed.latitude, seed.longitude, seed.address, seed.is_featured
FROM (VALUES
  ('Mod Kahve', 'İkinci espresso veya americano hediye.', 'Kafe', 40.9873, 29.0285, 'Moda Caddesi No: 24, Kadıköy', true),
  ('Burger Lab', 'Klasik smash menüde geç saat indirimi.', 'Yeme & İçme', 40.9887, 29.0308, 'Mühürdar Sokak No: 18, Kadıköy', true),
  ('Mint Gelato', 'İkinci top nane-çikolata dondurma hediye.', 'Yeme & İçme', 40.9906, 29.0254, 'Rıhtım Caddesi No: 12, Kadıköy', false),
  ('Qap Fit', 'Günlük girişte stüdyo ve havlu dahil.', 'Spor', 40.9894, 29.0324, 'Bahariye Caddesi No: 56, Kadıköy', false),
  ('Nane Berber', 'Fade ve sakal bakımında fırsat.', 'Güzellik', 40.9858, 29.0262, 'Moda Sokak No: 9, Kadıköy', false)
) AS seed(name, description, category, latitude, longitude, address, is_featured)
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

INSERT INTO public.campaigns (company_id, title, discount_rate, expiry_date, is_active)
SELECT c.id, seed.title, seed.discount_rate, (CURRENT_DATE + seed.days), true
FROM (VALUES
  ('Mod Kahve', 'İkinci espresso bizden', 50.00, 14),
  ('Burger Lab', 'Smash burger %35', 35.00, 10),
  ('Mint Gelato', 'Çift top nane', 45.00, 7),
  ('Qap Fit', 'Günlük giriş fırsatı', 60.00, 21),
  ('Nane Berber', 'Fade + sakal %40', 40.00, 5)
) AS seed(company_name, title, discount_rate, days)
JOIN public.companies c ON c.name = seed.company_name
WHERE NOT EXISTS (SELECT 1 FROM public.campaigns);
