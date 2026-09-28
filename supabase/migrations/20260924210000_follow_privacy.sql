-- Takip sayısı herkese açık, takipçi listesi yalnızca firma sahibi ve yöneticiye açık.

ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS business_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follows' AND column_name = 'company_id'
  ) THEN
    UPDATE public.follows
    SET business_id = company_id
    WHERE business_id IS NULL AND company_id IS NOT NULL;
    ALTER TABLE public.follows ALTER COLUMN company_id DROP NOT NULL;
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS follows_user_business_uidx
  ON public.follows (user_id, business_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follows readable" ON public.follows;
DROP POLICY IF EXISTS "Follows select own or staff" ON public.follows;
CREATE POLICY "Follows select own or staff"
  ON public.follows FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_current_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.company_id = follows.business_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users follow" ON public.follows;
CREATE POLICY "Users follow"
  ON public.follows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND business_id IS NOT NULL);

DROP POLICY IF EXISTS "Users unfollow" ON public.follows;
CREATE POLICY "Users unfollow"
  ON public.follows FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.count_company_followers(p_company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.follows
  WHERE business_id = p_company_id;
$$;

GRANT EXECUTE ON FUNCTION public.count_company_followers(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_company_followers(p_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  followed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_current_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.company_id = p_company_id
        AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    f.user_id,
    coalesce(
      nullif(trim(split_part(coalesce(p.full_name, ''), ' ', 1)), ''),
      'Üye'
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
END;
$$;

REVOKE ALL ON FUNCTION public.list_company_followers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_followers(uuid) TO authenticated;
