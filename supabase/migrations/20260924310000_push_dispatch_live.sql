-- Bildirim kuyruğu, uygulama kapalıyken de dispatch-push fonksiyonunu çağırır.

CREATE EXTENSION IF NOT EXISTS pg_net;

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
  BEGIN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name IN ('supabase_url', 'project_url')
    LIMIT 1;
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name IN ('service_role_key', 'supabase_service_role_key')
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
      NULL;
  END;

  v_url := coalesce(
    nullif(v_url, ''),
    nullif(current_setting('app.supabase_url', true), ''),
    'https://enwiogwzmylglqdathlq.supabase.co'
  );
  v_key := coalesce(
    nullif(v_key, ''),
    nullif(current_setting('app.service_role_key', true), ''),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVud2lvZ3d6bXlsZ2xxZGF0aGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzI1MTAsImV4cCI6MjEwNTI0ODUxMH0.AH1ZGbdNktdr1-McaFbw6PpWRDF0OjXrcfiFksusWTw'
  );

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/dispatch-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_business_approval_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' OR OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.push_outbox (kind, title, body, company_id, payload)
  VALUES (
    'approval',
    'Firma onaylandı',
    coalesce(nullif(trim(NEW.company_name), ''), 'Firmanız') || ' yönetim tarafından onaylandı.',
    NULL,
    jsonb_build_object('userId', NEW.user_id, 'businessId', NEW.id)
  );
  PERFORM public.kick_push_dispatch();
  RETURN NEW;
EXCEPTION
  WHEN undefined_column OR undefined_table THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_approval_push ON public.businesses;
CREATE TRIGGER on_business_approval_push
  AFTER UPDATE OF status ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_business_approval_push();
