CREATE TABLE IF NOT EXISTS public.admin_settings (
  admin_id uuid PRIMARY KEY,
  notify_user_signup boolean NOT NULL DEFAULT true,
  notify_business_signup boolean NOT NULL DEFAULT true,
  fcm_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own settings" ON public.admin_settings;
CREATE POLICY "Admins read own settings"
  ON public.admin_settings FOR SELECT TO authenticated
  USING (public.is_current_admin() AND admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins insert own settings" ON public.admin_settings;
CREATE POLICY "Admins insert own settings"
  ON public.admin_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_current_admin() AND admin_id = auth.uid());

DROP POLICY IF EXISTS "Admins update own settings" ON public.admin_settings;
CREATE POLICY "Admins update own settings"
  ON public.admin_settings FOR UPDATE TO authenticated
  USING (public.is_current_admin() AND admin_id = auth.uid())
  WITH CHECK (public.is_current_admin() AND admin_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_admin_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_settings_touch ON public.admin_settings;
CREATE TRIGGER admin_settings_touch
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE PROCEDURE public.touch_admin_settings();
