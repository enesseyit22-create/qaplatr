-- Gönderi görselleri: herkese açık okuma, giriş yapmış firma/yönetici yüklemesi.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Post images public read" ON storage.objects;
CREATE POLICY "Post images public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Post images merchant upload" ON storage.objects;
CREATE POLICY "Post images merchant upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
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
          AND lower(trim(c.owner_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  );

DROP POLICY IF EXISTS "Post images merchant delete" ON storage.objects;
CREATE POLICY "Post images merchant delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'post-images'
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
          AND lower(trim(c.owner_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  );

DROP POLICY IF EXISTS "Merchant admin insert posts" ON public.posts;
CREATE POLICY "Merchant admin insert posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND business_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = business_id
        AND lower(trim(c.owner_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

DROP POLICY IF EXISTS "Merchant admin delete posts" ON public.posts;
CREATE POLICY "Merchant admin delete posts"
  ON public.posts FOR DELETE TO authenticated
  USING (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND business_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = business_id
        AND lower(trim(c.owner_email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );
