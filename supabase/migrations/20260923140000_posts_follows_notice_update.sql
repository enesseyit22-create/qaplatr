ALTER TABLE public.app_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin updates notices" ON public.app_notices;
CREATE POLICY "Admin updates notices"
  ON public.app_notices FOR UPDATE TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  image_url text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_company_idx ON public.posts (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.follows (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS follows_company_idx ON public.follows (company_id);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts public read" ON public.posts;
CREATE POLICY "Posts public read"
  ON public.posts FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Merchant admin insert posts" ON public.posts;
CREATE POLICY "Merchant admin insert posts"
  ON public.posts FOR INSERT TO authenticated
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
  );

DROP POLICY IF EXISTS "Merchant admin delete posts" ON public.posts;
CREATE POLICY "Merchant admin delete posts"
  ON public.posts FOR DELETE TO authenticated
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
  );

DROP POLICY IF EXISTS "Follows readable" ON public.follows;
CREATE POLICY "Follows readable"
  ON public.follows FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users follow" ON public.follows;
CREATE POLICY "Users follow"
  ON public.follows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users unfollow" ON public.follows;
CREATE POLICY "Users unfollow"
  ON public.follows FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
