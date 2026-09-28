-- Kampanya ve kupon realtime + rol kısıtı. Tekrar çalıştırılabilir.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coupon_tickets;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_redemptions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.coupon_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.user_redemptions REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Coupon tickets staff update" ON public.coupon_tickets;
DROP POLICY IF EXISTS "Coupon tickets update by role" ON public.coupon_tickets;
CREATE POLICY "Coupon tickets update by role"
  ON public.coupon_tickets FOR UPDATE TO authenticated
  USING (
    public.is_current_admin()
    OR user_id = auth.uid()
    OR (
      public.is_current_merchant()
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    public.is_current_admin()
    OR (user_id = auth.uid() AND status IN ('cancelled', 'active'))
    OR (
      public.is_current_merchant()
      AND status IN ('used', 'cancelled', 'deleted')
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Coupon tickets delete staff" ON public.coupon_tickets;
CREATE POLICY "Coupon tickets delete staff"
  ON public.coupon_tickets FOR DELETE TO authenticated
  USING (
    public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL
          AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_tickets TO authenticated;

CREATE OR REPLACE FUNCTION public.set_coupon_ticket_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.coupon_tickets%ROWTYPE;
  v_company uuid;
BEGIN
  IF p_status NOT IN ('active', 'used', 'cancelled', 'deleted') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.coupon_tickets WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_current_admin() THEN
    NULL;
  ELSIF public.is_current_merchant() THEN
    SELECT p.company_id INTO v_company
    FROM public.profiles p
    WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
    ORDER BY CASE WHEN p.id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1;
    IF v_company IS NULL OR v_row.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('used', 'cancelled', 'deleted') THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSIF v_row.user_id = auth.uid() THEN
    IF p_status NOT IN ('cancelled', 'active') THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.coupon_tickets
  SET
    status = p_status,
    used_at = CASE WHEN p_status = 'used' THEN now() ELSE used_at END
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_coupon_ticket_status(uuid, text) TO authenticated;
