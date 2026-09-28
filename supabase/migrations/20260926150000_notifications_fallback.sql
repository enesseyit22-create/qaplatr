-- Edge Function kapalıyken yönetim bildiriminin düştüğü kayıt tablosu.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  from_kind text,
  from_name text,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin writes notifications" ON public.notifications;
CREATE POLICY "Admin writes notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "Admins read notifications" ON public.notifications;
CREATE POLICY "Admins read notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_current_admin());

GRANT SELECT, INSERT ON public.notifications TO authenticated;
