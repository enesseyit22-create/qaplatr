/*
Paylaşılan canlı veri: bildirim, hikaye, yasal metin, özellik bayrakları.
Firma/kampanya realtime yayını.
*/

CREATE TABLE IF NOT EXISTS public.app_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  from_kind text NOT NULL DEFAULT 'admin' CHECK (from_kind IN ('admin', 'company')),
  from_name text NOT NULL DEFAULT 'QapLA',
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'users', 'merchants')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_notices_created_idx ON public.app_notices (created_at DESC);
CREATE INDEX IF NOT EXISTS app_notices_audience_idx ON public.app_notices (audience, company_id);

CREATE TABLE IF NOT EXISTS public.app_live_settings (
  id text PRIMARY KEY DEFAULT 'main',
  legal jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_live_settings (id)
VALUES ('main')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  image_data text NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_by text NOT NULL CHECK (created_by IN ('admin', 'merchant')),
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS stories_expires_idx ON public.stories (expires_at DESC);

CREATE TABLE IF NOT EXISTS public.story_permissions (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_live_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notices readable by audience" ON public.app_notices;
CREATE POLICY "Notices readable by audience"
  ON public.app_notices FOR SELECT TO anon, authenticated
  USING (
    audience = 'all'
    OR public.is_current_admin()
    OR (
      audience = 'users'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.role = 'user'
          AND (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      )
    )
    OR (
      audience = 'merchants'
      AND public.is_current_merchant()
      AND (
        company_id IS NULL
        OR company_id IN (
          SELECT p.company_id
          FROM public.profiles p
          WHERE p.company_id IS NOT NULL
            AND (p.auth_user_id = auth.uid() OR lower(trim(p.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
        )
        OR company_id IN (
          SELECT c.id
          FROM public.companies c
          WHERE lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        )
      )
    )
  );

DROP POLICY IF EXISTS "Admin writes notices" ON public.app_notices;
CREATE POLICY "Admin writes notices"
  ON public.app_notices FOR INSERT TO authenticated
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Admin deletes notices" ON public.app_notices;
CREATE POLICY "Admin deletes notices"
  ON public.app_notices FOR DELETE TO authenticated
  USING (public.is_current_admin());

DROP POLICY IF EXISTS "Settings public read" ON public.app_live_settings;
CREATE POLICY "Settings public read"
  ON public.app_live_settings FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin writes settings" ON public.app_live_settings;
CREATE POLICY "Admin writes settings"
  ON public.app_live_settings FOR UPDATE TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Stories public read live" ON public.stories;
CREATE POLICY "Stories public read live"
  ON public.stories FOR SELECT TO anon, authenticated
  USING (expires_at > now() OR public.is_current_admin() OR public.is_current_merchant());

DROP POLICY IF EXISTS "Admin insert stories" ON public.stories;
CREATE POLICY "Admin insert stories"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND created_by = 'merchant'
      AND company_id IS NOT NULL
      AND company_id = (public.current_merchant_company()).id
      AND EXISTS (
        SELECT 1 FROM public.story_permissions sp
        WHERE sp.company_id = stories.company_id AND sp.allowed
      )
    )
  );

DROP POLICY IF EXISTS "Admin merchant delete stories" ON public.stories;
CREATE POLICY "Admin merchant delete stories"
  ON public.stories FOR DELETE TO authenticated
  USING (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id = (public.current_merchant_company()).id
    )
  );

DROP POLICY IF EXISTS "Story perms public read" ON public.story_permissions;
CREATE POLICY "Story perms public read"
  ON public.story_permissions FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin writes story perms" ON public.story_permissions;
CREATE POLICY "Admin writes story perms"
  ON public.story_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Admin updates story perms" ON public.story_permissions;
CREATE POLICY "Admin updates story perms"
  ON public.story_permissions FOR UPDATE TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

CREATE OR REPLACE FUNCTION public.touch_live_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_live_settings_touch ON public.app_live_settings;
CREATE TRIGGER app_live_settings_touch
  BEFORE UPDATE ON public.app_live_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_live_settings();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.app_notices;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.app_live_settings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.story_permissions;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
