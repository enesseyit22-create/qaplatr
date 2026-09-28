-- posts yabancı anahtarı companies.id olsun. Başvuru (businesses) kimliği firma kimliğine çevrilir.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS business_id uuid;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'posts'
      AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.posts p
SET business_id = c.id
FROM public.businesses b
JOIN public.companies c
  ON lower(trim(coalesce(c.owner_email, ''))) = lower(trim(coalesce(b.email, '')))
  OR lower(trim(coalesce(c.email, ''))) = lower(trim(coalesce(b.email, '')))
WHERE p.business_id = b.id
  AND c.id IS NOT NULL
  AND p.business_id IS DISTINCT FROM c.id;

DELETE FROM public.posts p
WHERE p.business_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p.business_id);

ALTER TABLE public.posts
  ALTER COLUMN business_id SET NOT NULL;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_business_id_companies_fkey
  FOREIGN KEY (business_id) REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS posts_business_idx ON public.posts (business_id, created_at DESC);
