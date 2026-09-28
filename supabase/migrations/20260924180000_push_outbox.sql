-- Push kuyruğu. follows canlı şeması: id, user_id, business_id, created_at.
-- company_id kolonuna dokunulmaz; yoksa sorgu da üretilmez.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fcm_token text NOT NULL,
  company_id uuid,
  platform text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.device_push_tokens ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'device_push_tokens_company_fkey'
  ) THEN
    ALTER TABLE public.device_push_tokens
      ADD CONSTRAINT device_push_tokens_company_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_user_token_uidx
  ON public.device_push_tokens (user_id, fcm_token);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own device token" ON public.device_push_tokens;
CREATE POLICY "Users read own device token"
  ON public.device_push_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own device token" ON public.device_push_tokens;
CREATE POLICY "Users insert own device token"
  ON public.device_push_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own device token" ON public.device_push_tokens;
CREATE POLICY "Users update own device token"
  ON public.device_push_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  company_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text
);

ALTER TABLE public.push_outbox ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.push_outbox ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.push_outbox ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE public.follows ADD COLUMN business_id uuid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'company_id'
  ) THEN
    EXECUTE $sql$
      UPDATE public.follows
      SET business_id = company_id
      WHERE business_id IS NULL
        AND company_id IS NOT NULL
    $sql$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS follows_business_idx ON public.follows (business_id);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS follows_user_business_uidx
    ON public.follows (user_id, business_id);
EXCEPTION
  WHEN unique_violation THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.kick_push_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;
  v_url := nullif(current_setting('app.supabase_url', true), '');
  v_key := nullif(current_setting('app.service_role_key', true), '');
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;
  EXECUTE
    'SELECT net.http_post(url := $1, body := $2::jsonb, headers := $3::jsonb)'
    USING
      v_url || '/functions/v1/dispatch-push',
      '{}',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_campaign_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, false) IS NOT TRUE THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_active, false) IS NOT TRUE OR COALESCE(OLD.is_active, false) IS TRUE THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(c.name), ''), 'Firma') INTO v_name
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  v_title := coalesce(nullif(trim(NEW.title), ''), 'Yeni kampanya');

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'campaign',
    v_title,
    coalesce(v_name, 'Firma') || ' yeni bir kampanya paylaştı.',
    NEW.company_id,
    jsonb_build_object('campaignId', NEW.id, 'companyId', NEW.company_id)
  );

  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_enqueue_push ON public.campaigns;
CREATE TRIGGER on_campaign_enqueue_push
  AFTER INSERT OR UPDATE OF is_active ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_campaign_push();

CREATE OR REPLACE FUNCTION public.notify_company_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_business uuid;
BEGIN
  v_business := NEW.business_id;
  IF v_business IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(trim(split_part(coalesce(pr.full_name, ''), ' ', 1)), ''), 'Bir üye')
  INTO v_name
  FROM public.profiles pr
  WHERE pr.id = NEW.user_id OR pr.auth_user_id = NEW.user_id
  ORDER BY CASE WHEN pr.id = NEW.user_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_name := coalesce(v_name, 'Bir üye');

  INSERT INTO public.app_notices (title, body, from_kind, from_name, audience, company_id)
  VALUES (
    'Yeni takipçi',
    v_name || ' sizi takip etmeye başladı.',
    'admin',
    'QapLA',
    'merchants',
    v_business
  );

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'follow',
    'Yeni takipçi',
    v_name || ' sizi takip etmeye başladı.',
    v_business,
    jsonb_build_object('companyId', v_business, 'userId', NEW.user_id)
  );

  PERFORM public.kick_push_dispatch();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_notify_company ON public.follows;
CREATE TRIGGER on_follow_notify_company
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_company_new_follower();
