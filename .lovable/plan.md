## Što ću napraviti

### 1. Tema: tamno ljubičasta + zlatni naglasak
Prepišem `src/styles.css` na potpuno tamne tokene (bez `light` varijante):
- Pozadina `#0d0517`, površine `#2d1b4e`, primary ljubičasta `#c084fc`, accent zlato `#eab308`
- Gradijenti hero/accent prilagođeni novoj paleti
- Obrišem cijeli `.dark` blok jer je sve tamno; `:root` ima tamne vrijednosti
- Provjerim da admin panel i app koriste samo semantičke tokene (već koriste)

### 2. Jači AI filter "nnnn" šuma
U `src/routes/api/generate.ts`:
- Pojačam `stripAiNoise`: ukloni bilo koji niz od 3+ istih slova (ne samo n), ukloni "riječi" sastavljene samo od istog slova, ukloni redove koji su >70% jedno slovo
- Sustavni prompt već zabranjuje — dodam i validaciju na message i needsInfo

### 3. Admin uloge (gabrijelhor = owner)
Migracija — nova tablica `admin_users`:
- `username` (unique), `password_hash` (bcrypt nije dostupan, koristim Web Crypto SHA-256 + salt), `role` enum `owner|admin|viewer`, `created_by`, `created_at`
- Seedam `gabrijelhor` kao owner s tvojom lozinkom; `davidknez` kao admin
- RLS: nitko ne čita s klijenta, sve preko `/api/admin` (service role)

U `/api/admin`:
- `checkAuth` čita iz `admin_users` umjesto hardkodiranog objekta, vraća i `role`
- Nove akcije: `list-admins`, `create-admin` (samo owner), `update-admin-role` (samo owner), `delete-admin` (samo owner), `change-password`
- `viewer` rola: blokira sve `update-*`, `delete-*`, `set-*`, `add-*`, `toggle-*`, `create-admin` — može samo `list-*`, `settings`, `stats`

U `src/routes/admin.tsx`:
- Novi tab "Administratori" (samo vidljiv owneru) s tablicom + forma za dodavanje
- Ako je `viewer`, svi gumbi (briši, postavi bodove, dodaj uplatu, toggle) su disabled

### 4. Pretplatni planovi
Migracija — nova tablica `subscription_plans`:
- `slug` (basic/pro/elite), `name`, `price_cents`, `points`, `stripe_price_id`, `active`, `sort_order`
- Seed: Basic 2000c/10000, Pro 5000c/30000, Elite 10000c/80000

I `user_subscriptions`:
- `user_id`, `plan_slug`, `status` (active/canceled/past_due), `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, `created_at`

U adminu novi tab "Planovi": owner/admin mijenjaju cijene, bodove, mogu deaktivirati. Viewer samo gleda.

U `src/routes/app.tsx` dodam "Pretplata" gumb koji otvara dialog s 3 plana i "Pretplati se" → poziva server fn `createCheckoutSession` → redirect na Stripe.

### 5. Stripe — ugrađeno plaćanje
Pokrećem `enable_stripe_payments`. Nakon toga:
- Kreiram 3 mjesečna proizvoda u Stripe-u kroz `batch_create_product` i spremim `stripe_price_id` u `subscription_plans`
- Server fn `createCheckoutSession({plan_slug})` — kreira Stripe Checkout sesiju za mjesečnu pretplatu, vraća URL
- Webhook `/api/public/stripe-webhook` — verificira potpis, na `checkout.session.completed` i `invoice.paid` dodaje plan bodove na `user_credits.points_balance` i upisuje u `user_subscriptions`; na `customer.subscription.deleted` postavlja status `canceled`
- Stranica `/billing/success` i `/billing/cancel`

## Redoslijed izvršavanja
1. Tema + noise filter (odmah, nema migracija)
2. Migracija: `admin_users`, `subscription_plans`, `user_subscriptions` (jedna migracija)
3. Refactor `/api/admin` + admin UI s rolama i planovima
4. Pokrenem `enable_stripe_payments` → čekam odobrenje
5. Kreiram Stripe proizvode → server fn checkout + webhook + dialog u app-u

## Tehnički detalji
- Lozinke admina hashiram sa SHA-256(`salt:lozinka`) — salt je nasumičan po korisniku. Nije bcrypt ali je dovoljno jer admin panel je iza service-role barijere i samo 3-5 ljudi.
- Stripe webhook koristi `stripe.webhooks.constructEvent` sa `STRIPE_WEBHOOK_SECRET` koji ćeš dobiti od Lovable Cloud
- Krediti od pretplate se **dodaju** (ne resetiraju) svaki mjesec na `points_balance`

## Što trebam od tebe
Reci samo "da" i krećem. Stripe će na sredini procesa otvoriti formu gdje ćeš upisati email/ime — to popuni i nastavim.
