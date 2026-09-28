-- Başvuru sahibi kendi kaydını onaylayamasın. Yönetici onayı admin politikasında kalır.

DROP POLICY IF EXISTS "Businesses update own pending" ON public.businesses;
CREATE POLICY "Businesses update own pending"
  ON public.businesses FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
