-- Aktif kampanyalar ve görselleri: onaylı (veya yönetici tarafından açılmış) firmalar herkese açık.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duration_type text NOT NULL DEFAULT 'date',
  ADD COLUMN IF NOT EXISTS duration_hours integer;

CREATE OR REPLACE FUNCTION public.company_is_public(p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.businesses b WHERE b.company_id = c.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.businesses b
          WHERE b.company_id = c.id
            AND b.status = 'approved'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.company_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_is_public(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_company_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.companies c
  WHERE public.company_is_public(c.id);
$$;

REVOKE ALL ON FUNCTION public.list_public_company_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_company_ids() TO anon, authenticated;

GRANT SELECT ON public.campaigns TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Public can read active campaigns" ON public.campaigns;
CREATE POLICY "Public can read active campaigns"
  ON public.campaigns FOR SELECT
  TO anon, authenticated
  USING (
    (
      coalesce(is_active, false) = true
      AND public.company_is_public(company_id)
    )
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

DROP POLICY IF EXISTS "Merchant admin update campaigns" ON public.campaigns;
CREATE POLICY "Merchant admin update campaigns"
  ON public.campaigns FOR UPDATE
  TO authenticated
  USING (
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
      WHERE c.id = campaigns.company_id
        AND (
          lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
    )
  )
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campaign-images',
  'campaign-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Campaign images public read" ON storage.objects;
CREATE POLICY "Campaign images public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'campaign-images');

DROP POLICY IF EXISTS "Campaign images merchant upload" ON storage.objects;
CREATE POLICY "Campaign images merchant upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-images'
    AND (
      public.is_current_admin()
      OR (
        public.is_current_merchant()
        AND (storage.foldername(name))[1] IN (
          SELECT p.company_id::text
          FROM public.profiles p
          WHERE p.company_id IS NOT NULL
            AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
        )
      )
      OR EXISTS (
        SELECT 1
        FROM public.companies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (
            lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
      )
    )
  );
