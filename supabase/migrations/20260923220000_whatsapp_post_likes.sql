ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.post_likes (
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS post_likes_post_idx ON public.post_likes (post_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post likes readable" ON public.post_likes;
CREATE POLICY "Post likes readable"
  ON public.post_likes FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Users like posts" ON public.post_likes;
CREATE POLICY "Users like posts"
  ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users unlike posts" ON public.post_likes;
CREATE POLICY "Users unlike posts"
  ON public.post_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
END $$;
