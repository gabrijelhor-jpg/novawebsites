-- Pricing & credits system

-- Pricing fields on site_settings
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS cents_per_1000_points integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS points_per_chat integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS free_starting_points integer NOT NULL DEFAULT 500;

-- Per-user credits
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 500,
  is_free boolean NOT NULL DEFAULT false,
  total_used_points integer NOT NULL DEFAULT 0,
  total_paid_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own credits" ON public.user_credits;
CREATE POLICY "Users view own credits" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  starting integer;
BEGIN
  SELECT free_starting_points INTO starting FROM public.site_settings WHERE id = 1;
  INSERT INTO public.user_credits (user_id, points_balance)
  VALUES (NEW.id, COALESCE(starting, 500))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- Backfill for existing users
INSERT INTO public.user_credits (user_id, points_balance)
SELECT id, 500 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;