-- Kampanyalar: eksik kolonlar, aktif olanları herkes okur, firma ve yönetici ekleyebilir.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duration_type text NOT NULL DEFAULT 'date',
  ADD COLUMN IF NOT EXISTS duration_hours integer;

GRANT SELECT ON public.campaigns TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public can read active campaigns" ON public.campaigns;
CREATE POLICY "Public can read active campaigns"
  ON public.campaigns FOR SELECT
  TO anon, authenticated
  USING (
    coalesce(is_active, false) = true
    OR public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = campaigns.company_id
        AND (
          lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
  );

DROP POLICY IF EXISTS "Campaigns writes locked" ON public.campaigns;
DROP POLICY IF EXISTS "Merchant admin insert campaigns" ON public.campaigns;
CREATE POLICY "Merchant admin insert campaigns"
  ON public.campaigns FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id
        AND (
          lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
