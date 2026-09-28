CREATE TABLE IF NOT EXISTS public.coupon_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid,
  campaign_id uuid,
  company_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired', 'deleted')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS coupon_tickets_company_idx ON public.coupon_tickets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_tickets_user_idx ON public.coupon_tickets (user_id, created_at DESC);

ALTER TABLE public.coupon_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coupon tickets select own or staff" ON public.coupon_tickets;
CREATE POLICY "Coupon tickets select own or staff"
  ON public.coupon_tickets FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_current_admin()
    OR (
      public.is_current_merchant()
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p
        WHERE p.company_id IS NOT NULL AND (p.id = auth.uid() OR p.auth_user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Coupon tickets insert own" ON public.coupon_tickets;
CREATE POLICY "Coupon tickets insert own"
  ON public.coupon_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Coupon tickets staff update" ON public.coupon_tickets;
CREATE POLICY "Coupon tickets staff update"
  ON public.coupon_tickets FOR UPDATE TO authenticated
  USING (public.is_current_admin() OR public.is_current_merchant())
  WITH CHECK (public.is_current_admin() OR public.is_current_merchant());

GRANT SELECT, INSERT, UPDATE ON public.coupon_tickets TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coupon_tickets;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
