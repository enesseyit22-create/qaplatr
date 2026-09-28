CREATE TABLE IF NOT EXISTS public.admin_login_secrets (
  email text PRIMARY KEY,
  password text NOT NULL,
  kind text NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'merchant', 'admin')),
  company_id uuid,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_login_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_login_secrets_admin" ON public.admin_login_secrets;
CREATE POLICY "admin_login_secrets_admin"
  ON public.admin_login_secrets
  FOR ALL
  TO authenticated
  USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

CREATE OR REPLACE FUNCTION public.admin_provision_login(
  p_email text,
  p_password text,
  p_role text DEFAULT 'user',
  p_phone text DEFAULT '',
  p_full_name text DEFAULT '',
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_id uuid;
  v_email text := lower(trim(p_email));
  v_role text := coalesce(nullif(trim(p_role), ''), 'user');
  v_instance uuid;
BEGIN
  IF NOT public.is_current_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('user', 'merchant', 'admin') THEN
    v_role := 'user';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'password_too_short' USING ERRCODE = '22023';
  END IF;

  SELECT instance_id INTO v_instance FROM auth.users LIMIT 1;
  IF v_instance IS NULL THEN
    v_instance := '00000000-0000-0000-0000-000000000000';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      v_instance,
      v_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('phone', coalesce(p_phone, ''), 'role', v_role, 'full_name', coalesce(p_full_name, '')),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    IF NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email),
        'email',
        v_email,
        now(),
        now(),
        now()
      );
    END IF;
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (v_id, v_email, nullif(trim(p_full_name), ''), v_role)
  ON CONFLICT (id) DO UPDATE
    SET email = excluded.email,
        role = excluded.role,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

  INSERT INTO public.admin_login_secrets (email, password, kind, company_id, label, updated_at)
  VALUES (v_email, p_password, v_role, p_company_id, nullif(trim(p_full_name), ''), now())
  ON CONFLICT (email) DO UPDATE
    SET password = excluded.password,
        kind = excluded.kind,
        company_id = coalesce(excluded.company_id, public.admin_login_secrets.company_id),
        label = coalesce(excluded.label, public.admin_login_secrets.label),
        updated_at = now();

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_provision_login(text, text, text, text, text, uuid) TO authenticated;
