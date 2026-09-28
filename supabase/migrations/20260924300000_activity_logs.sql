-- Kalıcı aktivite geçmişi. Çıkış log satırını silmez.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  company_id uuid,
  action_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_company_idx ON public.activity_logs (company_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity logs admin read" ON public.activity_logs;
CREATE POLICY "Activity logs admin read"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_current_admin() OR user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.activity_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_activity(
  p_action text,
  p_company uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR nullif(trim(p_action), '') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.activity_logs (user_id, company_id, action_type, details)
  VALUES (auth.uid(), p_company, left(trim(p_action), 80), coalesce(p_details, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(text, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.write_activity_log(
  p_user uuid,
  p_company uuid,
  p_action text,
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, company_id, action_type, details)
  VALUES (p_user, p_company, left(coalesce(p_action, 'unknown'), 80), coalesce(p_details, '{}'::jsonb));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.write_activity_log(uuid, uuid, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.log_campaign_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_activity_log(
    auth.uid(),
    NEW.company_id,
    'campaign_share',
    jsonb_build_object('campaign_id', NEW.id, 'title', NEW.title, 'is_active', NEW.is_active)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_activity_log ON public.campaigns;
CREATE TRIGGER on_campaign_activity_log
  AFTER INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.log_campaign_activity();

CREATE OR REPLACE FUNCTION public.log_follow_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_company uuid := nullif(coalesce(v_row->>'business_id', v_row->>'company_id'), '')::uuid;
  v_user uuid := nullif(v_row->>'user_id', '')::uuid;
BEGIN
  PERFORM public.write_activity_log(
    coalesce(v_user, auth.uid()),
    v_company,
    CASE WHEN TG_OP = 'DELETE' THEN 'unfollow' ELSE 'follow' END,
    jsonb_build_object('company_id', v_company)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_follow_activity_log ON public.follows;
CREATE TRIGGER on_follow_activity_log
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.log_follow_activity();

CREATE OR REPLACE FUNCTION public.log_like_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_user uuid := nullif(v_row->>'user_id', '')::uuid;
  v_post uuid := nullif(v_row->>'post_id', '')::uuid;
  v_company uuid;
  v_post_row jsonb;
BEGIN
  BEGIN
    SELECT to_jsonb(p) INTO v_post_row FROM public.posts p WHERE p.id = v_post;
    v_company := nullif(coalesce(v_post_row->>'business_id', v_post_row->>'company_id'), '')::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      v_company := NULL;
  END;
  PERFORM public.write_activity_log(
    coalesce(v_user, auth.uid()),
    v_company,
    CASE WHEN TG_OP = 'DELETE' THEN 'unlike' ELSE 'like' END,
    jsonb_build_object('post_id', v_post)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_like_activity_log ON public.post_likes;
CREATE TRIGGER on_like_activity_log
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_like_activity();
