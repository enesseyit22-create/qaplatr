-- Fix: follows uses business_id (not company_id) in live Qap La DB.

CREATE TABLE IF NOT EXISTS public.company_push_tokens (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fcm_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

ALTER TABLE public.company_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchant inserts own push token" ON public.company_push_tokens;
CREATE POLICY "Merchant inserts own push token"
  ON public.company_push_tokens FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.company_id = company_push_tokens.company_id
          AND (p.auth_user_id = auth.uid() OR p.id = auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = company_push_tokens.company_id
          AND lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  );

DROP POLICY IF EXISTS "Merchant reads own push token" ON public.company_push_tokens;
CREATE POLICY "Merchant reads own push token"
  ON public.company_push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Merchant updates own push token" ON public.company_push_tokens;
CREATE POLICY "Merchant updates own push token"
  ON public.company_push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.list_company_followers(p_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  followed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.user_id,
    coalesce(
      nullif(trim(split_part(coalesce(p.full_name, ''), ' ', 1)), ''),
      'Ãœye'
    ),
    f.created_at
  FROM public.follows f
  LEFT JOIN LATERAL (
    SELECT pr.full_name
    FROM public.profiles pr
    WHERE pr.id = f.user_id OR pr.auth_user_id = f.user_id
    ORDER BY CASE WHEN pr.id = f.user_id THEN 0 ELSE 1 END
    LIMIT 1
  ) p ON true
  WHERE f.business_id = p_company_id
  ORDER BY f.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.list_company_followers(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_company_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT coalesce(nullif(trim(split_part(coalesce(pr.full_name, ''), ' ', 1)), ''), 'Bir Ã¼ye')
  INTO v_name
  FROM public.profiles pr
  WHERE pr.id = NEW.user_id OR pr.auth_user_id = NEW.user_id
  ORDER BY CASE WHEN pr.id = NEW.user_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_name := coalesce(v_name, 'Bir Ã¼ye');

  INSERT INTO public.app_notices (title, body, from_kind, from_name, audience, company_id)
  VALUES (
    'Yeni takipÃ§i',
    v_name || ' sizi takip etmeye baÅŸladÄ±.',
    'admin',
    'QapLA',
    'merchants',
    NEW.business_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_notify_company ON public.follows;
CREATE TRIGGER on_follow_notify_company
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_company_new_follower();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;