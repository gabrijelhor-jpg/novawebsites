ALTER TABLE public.generations
ADD COLUMN IF NOT EXISTS public_slug text,
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS generations_public_slug_unique
ON public.generations (lower(public_slug))
WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.generation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  html text NOT NULL,
  prompt text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT 'Verzija',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.generation_versions TO authenticated;
GRANT ALL ON public.generation_versions TO service_role;

ALTER TABLE public.generation_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own generation versions"
ON public.generation_versions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own generation versions"
ON public.generation_versions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own generation versions"
ON public.generation_versions
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS generation_versions_generation_id_created_at_idx
ON public.generation_versions (generation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_versions_user_id_idx
ON public.generation_versions (user_id);