-- Firma logo ve kapak: kolonlar, herkese açık storage, sahip güncellemesi.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-images',
  'company-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Company images public read" ON storage.objects;
CREATE POLICY "Company images public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'company-images');

DROP POLICY IF EXISTS "Company images owner upload" ON storage.objects;
CREATE POLICY "Company images owner upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-images'
    AND (
      public.is_current_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT p.company_id::text FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (
            lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
      )
    )
  );

DROP POLICY IF EXISTS "Company images owner update" ON storage.objects;
CREATE POLICY "Company images owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-images'
    AND (
      public.is_current_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT p.company_id::text FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (
            lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
      )
    )
  )
  WITH CHECK (bucket_id = 'company-images');

DROP POLICY IF EXISTS "Company owner updates profile" ON public.companies;
CREATE POLICY "Company owner updates profile"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    public.is_current_admin()
    OR id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.company_id IS NOT NULL
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
    OR lower(trim(coalesce(owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    OR lower(trim(coalesce(email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
  WITH CHECK (
    public.is_current_admin()
    OR id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.company_id IS NOT NULL
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
    OR lower(trim(coalesce(owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    OR lower(trim(coalesce(email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
