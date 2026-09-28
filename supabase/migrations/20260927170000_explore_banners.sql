-- Keşfet vitrini: yönetici banner ekler, herkes okur. Kampanya görselleri de herkese açık kalır.

CREATE TABLE IF NOT EXISTS public.explore_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.explore_banners ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.explore_banners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.explore_banners TO authenticated;

DROP POLICY IF EXISTS "Public reads active banners" ON public.explore_banners;
CREATE POLICY "Public reads active banners"
  ON public.explore_banners FOR SELECT
  TO anon, authenticated
  USING (coalesce(is_active, false) = true OR public.is_current_admin());

DROP POLICY IF EXISTS "Admin inserts banners" ON public.explore_banners;
CREATE POLICY "Admin inserts banners"
  ON public.explore_banners FOR INSERT
  TO authenticated
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Admin updates banners" ON public.explore_banners;
CREATE POLICY "Admin updates banners"
  ON public.explore_banners FOR UPDATE
  TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Admin deletes banners" ON public.explore_banners;
CREATE POLICY "Admin deletes banners"
  ON public.explore_banners FOR DELETE
  TO authenticated
  USING (public.is_current_admin());

ALTER TABLE public.explore_banners REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.explore_banners;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banner-images',
  'banner-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Banner images public read" ON storage.objects;
CREATE POLICY "Banner images public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'banner-images');

DROP POLICY IF EXISTS "Banner images admin upload" ON storage.objects;
CREATE POLICY "Banner images admin upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'banner-images' AND public.is_current_admin());

DROP POLICY IF EXISTS "Banner images admin delete" ON storage.objects;
CREATE POLICY "Banner images admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'banner-images' AND public.is_current_admin());

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

GRANT SELECT ON public.campaigns TO anon, authenticated;
