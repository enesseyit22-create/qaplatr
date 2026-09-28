-- Yeni üye / firma başvurusu bildirimi yalnızca yöneticiye.

ALTER TABLE public.app_notices DROP CONSTRAINT IF EXISTS app_notices_audience_check;
ALTER TABLE public.app_notices
  ADD CONSTRAINT app_notices_audience_check
  CHECK (audience IN ('all', 'users', 'merchants', 'admin'));

CREATE OR REPLACE FUNCTION public.notify_admins_signup(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'user' THEN
    INSERT INTO public.app_notices (title, body, from_kind, from_name, audience)
    VALUES ('Yeni kullanıcı', 'Uygulamaya yeni bir üye kaydoldu.', 'admin', 'QapLA', 'admin');
  ELSIF p_kind = 'business' THEN
    INSERT INTO public.app_notices (title, body, from_kind, from_name, audience)
    VALUES ('Yeni firma başvurusu', 'Onay bekleyen yeni bir firma başvurusu var.', 'admin', 'QapLA', 'admin');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_admins_signup(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_admins_new_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_notices (title, body, from_kind, from_name, audience)
  VALUES (
    'Yeni firma başvurusu',
    trim(NEW.company_name) || ' onay bekliyor.',
    'admin',
    'QapLA',
    'admin'
  );
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Notices readable by audience" ON public.app_notices;
CREATE POLICY "Notices readable by audience"
  ON public.app_notices FOR SELECT TO anon, authenticated
  USING (
    (
      audience = 'admin'
      AND public.is_current_admin()
    )
    OR (
      audience <> 'admin'
      AND (
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
      )
    )
  );
