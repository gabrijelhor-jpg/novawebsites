# Stripe plaćanje karticom za bodove (tvoj API ključ)

## Cilj
Korisnik na `/pretplata` bira plan i može platiti karticom preko Stripea (mjesečna pretplata). Kad uplata prođe, bodovi mu se automatski dodaju. Postojeći IBAN tok s admin odobrenjem ostaje kao druga opcija.

## Prije koda: treba mi tvoj Stripe ključ
Kad odobriš plan, otvorit ću ti sigurnu formu za unos `STRIPE_SECRET_KEY` (počinje sa `sk_test_` ili `sk_live_`). Ključ nikad ne ide u kod ni u chat — sprema se kao tajna varijabla na serveru.

Napomena: pošto nemaš 18, Stripe račun mora biti otvoren na nekoga tko smije (roditelj/firma) — kod radi jednako s test ključem dok to ne riješiš.

## Što se gradi

### 1) `/pretplata` — dva načina plaćanja
Svaki plan dobiva dva gumba:
- **Plati karticom** → otvara Stripe Checkout (broj kartice, CVC, datum unosi se na Stripeovoj sigurnoj stranici, ne kod nas — tako nalaže PCI-DSS)
- **Plati na IBAN** → postojeći tok s pozivom na broj i admin odobrenjem (nepromijenjen)

Nakon plaćanja Stripe vraća korisnika na `/pretplata?stripe=success` uz poruku "Pretplata aktivna, bodovi dodani".

### 2) Server logika
- `createCheckoutSession` (server funkcija): uzima plan, kreira/nalazi Stripe kupca za prijavljenog korisnika, otvara mjesečnu subscription Checkout sesiju u EUR i vraća URL.
- Cijena: koristi `subscription_plans.stripe_price_id` ako postoji; ako je prazan, automatski kreira Price u Stripeu iz `price_cents` i zapiše ga natrag u tablicu — znači cijene i dalje mijenjaš u admin panelu.
- Webhook `/api/public/stripe-webhook` (potpis se provjerava):
  - `checkout.session.completed` → upiše `user_subscriptions` red sa `status = 'active'`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end`, doda bodove na `user_credits.points_balance`, poveća `total_paid_cents`
  - `invoice.paid` (obnova svaki mjesec) → ponovno doda bodove i pomakne `current_period_end`
  - `customer.subscription.deleted` / `invoice.payment_failed` → status `expired` / `past_due`
  - Idempotencija po Stripe event ID-u da se bodovi ne dupliraju

### 3) Admin panel
- U kartici "Planovi" prikazuje se `stripe_price_id` po planu (read-only, s gumbom "Resetiraj" ako promijeniš cijenu).
- U kartici "Plaćanja" uz IBAN uplate vide se i Stripe pretplate (izvor: kartica / IBAN), status, iznos i datum obnove.
- Gumb "Otkaži pretplatu" za Stripe pretplate (otkazuje na kraju perioda).

### 4) Korisnik u studiju
- U `/app` sidebaru pored stanja bodova prikaz aktivnog plana i datuma obnove.

## Tehnički detalji
- Paket: `stripe` (Node SDK, radi na edge runtimeu preko fetch klijenta).
- Nova datoteka `src/lib/stripe.server.ts` (klijent, čita `process.env.STRIPE_SECRET_KEY` unutar handlera) i `src/lib/billing.functions.ts` (`createCheckoutSession`, `cancelSubscription`).
- Webhook kao TanStack server ruta `src/routes/api/public/stripe-webhook.ts`, potpis se provjerava preko `STRIPE_WEBHOOK_SECRET` (drugi secret koji ću tražiti; do tada webhook odbija zahtjeve).
- Migracija: nova tablica `stripe_events (id text primary key, created_at)` za idempotenciju + GRANT za `service_role`. Postojeće `stripe_price_id`, `stripe_customer_id`, `stripe_subscription_id` kolone već postoje pa se koriste.
- Bodovi se pišu preko `supabaseAdmin` (webhook nema korisničku sesiju).

## Što NE radim
- Ne radim vlastitu formu za broj kartice/CVC — to je zabranjeno bez PCI certifikacije; unos ide na Stripe Checkout.
- Ne diram postojeći IBAN tok ni admin odobravanje.
- Ne mijenjam generiranje stranica ni potrošnju bodova.
