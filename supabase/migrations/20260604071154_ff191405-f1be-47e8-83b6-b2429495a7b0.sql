ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS reference_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS amount_cents integer,
  ADD COLUMN IF NOT EXISTS points integer,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.user_subscriptions ALTER COLUMN status SET DEFAULT 'pending';

GRANT INSERT ON public.user_subscriptions TO authenticated;

DROP POLICY IF EXISTS "Users insert own subscription request" ON public.user_subscriptions;
CREATE POLICY "Users insert own subscription request"
ON public.user_subscriptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending');