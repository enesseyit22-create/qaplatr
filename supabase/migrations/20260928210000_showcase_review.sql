-- Vitrin ve hikaye onay kuyruğu. Mevcut satırlar yayında kalır.

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live';

DO $$
BEGIN
  IF to_regclass('public.explore_banners') IS NOT NULL THEN
    ALTER TABLE public.explore_banners ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin';
    ALTER TABLE public.explore_banners ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live';
  END IF;
END $$;

GRANT UPDATE ON public.stories TO authenticated;

DROP POLICY IF EXISTS "Stories public read live" ON public.stories;
CREATE POLICY "Stories public read live"
  ON public.stories FOR SELECT TO anon, authenticated
  USING (
    (
      expires_at > now()
      AND coalesce(status, 'live') <> 'pending'
    )
    OR public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id IS NOT NULL
      AND company_id = (public.current_merchant_company()).id
    )
  );

DROP POLICY IF EXISTS "Admin insert stories" ON public.stories;
CREATE POLICY "Admin insert stories"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND created_by = 'merchant'
      AND coalesce(status, 'pending') = 'pending'
      AND company_id IS NOT NULL
      AND company_id = (public.current_merchant_company()).id
      AND (
        EXISTS (
          SELECT 1 FROM public.story_permissions sp
          WHERE sp.company_id = stories.company_id AND sp.allowed
        )
        OR EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = stories.company_id AND c.plan_tier = 'premium'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Admin updates stories" ON public.stories;
CREATE POLICY "Admin updates stories"
  ON public.stories FOR UPDATE TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DO $$
BEGIN
  IF to_regclass('public.explore_banners') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Public reads active banners" ON public.explore_banners;
  CREATE POLICY "Public reads active banners"
    ON public.explore_banners FOR SELECT
    TO anon, authenticated
    USING (
      (
        coalesce(is_active, false) = true
        AND coalesce(status, 'live') <> 'pending'
      )
      OR public.is_current_admin()
      OR (
        public.is_current_merchant()
        AND company_id IS NOT NULL
        AND company_id = (public.current_merchant_company()).id
      )
    );

  DROP POLICY IF EXISTS "Premium company requests banner" ON public.explore_banners;
  CREATE POLICY "Premium company requests banner"
    ON public.explore_banners FOR INSERT
    TO authenticated
    WITH CHECK (
      public.is_current_merchant()
      AND source = 'company'
      AND status = 'pending'
      AND coalesce(is_active, false) = false
      AND company_id IS NOT NULL
      AND company_id = (public.current_merchant_company()).id
      AND EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = explore_banners.company_id
          AND c.plan_tier = 'premium'
      )
    );
END $$;
