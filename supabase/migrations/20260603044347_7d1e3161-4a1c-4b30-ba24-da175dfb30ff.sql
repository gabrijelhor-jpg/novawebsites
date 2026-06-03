-- ========== Admin users with roles ==========
CREATE TYPE public.admin_role AS ENUM ('owner', 'admin', 'viewer');

CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  role public.admin_role NOT NULL DEFAULT 'admin',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- No public policies: only service-role access (admin API uses service key)

CREATE TRIGGER admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed gabrijelhor (owner) and davidknez (admin) with sha256(salt:password)
INSERT INTO public.admin_users (username, password_hash, password_salt, role, created_by) VALUES
  ('gabrijelhor', '1d1cc68aaa7ad83eb01440cefb291fafbacd6f0b0d6634712136faac0c5a9f22', 'nova-salt-gh', 'owner', 'seed'),
  ('davidknez',   '69e44d52a3b115c68352cf8917f92b100542f5f3862391e9f517634b5375c134', 'nova-salt-dk', 'admin', 'seed');

-- ========== Subscription plans (admin-editable) ==========
CREATE TABLE public.subscription_plans (
  slug text PRIMARY KEY,
  name text NOT NULL,
  price_cents integer NOT NULL,
  points integer NOT NULL,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans" ON public.subscription_plans FOR SELECT USING (true);

CREATE TRIGGER subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subscription_plans (slug, name, price_cents, points, sort_order) VALUES
  ('basic', 'Basic', 2000, 10000, 1),
  ('pro',   'Pro',   5000, 30000, 2),
  ('elite', 'Elite',10000, 80000, 3);

-- ========== User subscriptions ==========
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_slug text NOT NULL REFERENCES public.subscription_plans(slug),
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_subscriptions_user_id_idx ON public.user_subscriptions(user_id);

GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions" ON public.user_subscriptions
FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
