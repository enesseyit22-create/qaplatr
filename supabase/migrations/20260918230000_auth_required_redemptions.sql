/*
# Auth zorunlu kupon kullanımı

- Kampanya kullanımı yalnızca giriş yapmış kullanıcılar içindir (auth.uid()).
- İstemciden gelen p_user_id yok sayılır; sahte kimlikle kupon basılamaz.
- companies / campaigns misafir okumaya açık kalır.
*/

CREATE OR REPLACE FUNCTION public.resolve_redemption_user_id(p_user_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN auth.uid()::text;
END;
$$;

COMMENT ON FUNCTION public.resolve_redemption_user_id(text) IS
  'Kupon kimliği yalnızca Supabase Auth oturumundan (auth.uid) alınır.';
