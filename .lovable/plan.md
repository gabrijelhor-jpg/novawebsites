
## Cilj
Ti (admin) klikneš jedan gumb kad ti uplata sjedne na IBAN — sustav odmah aktivira korisnikovu pretplatu, doda mu bodove i pošalje mu mail da je pretplata aktivna. Stripe se ne dira jer nisi punoljetan.

## Što se mijenja

### 1) Admin panel (`/admin`) — sekcija "Pretplate na čekanju"
- Nova lista svih `user_subscriptions` sa statusom `pending`: prikazuje email korisnika, plan, iznos, poziv na broj, datum.
- Dva gumba po retku:
  - **Odobri** → poziva serverFn `approveSubscription`
  - **Odbij** → poziva serverFn `rejectSubscription` (uz opcionalnu napomenu)
- Posebna kartica iznad: brojač "X uplata čeka tvoj pregled".

### 2) Server logika (`approveSubscription`)
Jedna serverFn koja s admin pravima napravi sve u jednoj transakciji:
- Postavi `user_subscriptions.status = 'active'`, `approved_at = now()`, `current_period_end = now() + 30 dana`.
- Doda `user_subscriptions.points` na `user_credits.points_balance` korisnika.
- Poveća `user_credits.total_paid_cents` za iznos uplate.
- Pošalje email korisniku s temom "Tvoja Nova pretplata je aktivna" i sažetkom (plan, bodovi, do kada vrijedi).

`rejectSubscription` samo označi `status = 'rejected'` + spremi razlog u `note`. Ne šalje mail (ili šalje "uplata nije primljena" — pitat ću po potrebi, default = ne šalje).

### 3) Email obavijest
- Koristim ugrađenu Lovable email infrastrukturu (ne traži vanjski API ključ).
- Prvi korak: postavljanje email domene (ti samo klikneš "Set up email domain" — dobiješ npr. `notify.tvoja-domena.com`). Dok DNS ne prođe, mail se zapisuje u red i kreće čim domena postane aktivna.
- Template: `subscription-activated.tsx` u `src/lib/email-templates/` — brendiran u Nova stilu (tamna pozadina, gradient akcent), prikazuje ime plana, broj dobivenih bodova, datum isteka, link na `/app`.

### 4) Sitno UX
- Na `/pretplata` ispod uputa za uplatu dodajem rečenicu: "Čim primimo uplatu (obično isti dan), aktivirat ćemo ti pretplatu i poslati mail."
- U adminu povijest svih pretplata ostaje vidljiva s statusom (pending/active/rejected).

## Tehnički detalji
- Nova serverFn datoteka: `src/lib/subscriptions.functions.ts` (`approveSubscription`, `rejectSubscription`) — koristi `supabaseAdmin` jer trebamo bypass RLS-a za pisanje u `user_credits` tuđeg korisnika; ulaz se prvo provjerava kroz admin sesiju (isti pattern kao postojeći admin endpointi u `src/routes/api/admin.ts`).
- Migracija: dodati `UPDATE` policy na `user_subscriptions` za `service_role` (već ima `ALL` kroz service role, pa vjerojatno samo provjera). Dodati `UPDATE` na `user_credits` preko service_role (već ima implicitno, ali eksplicitno radi jasnoće — ako linter prijavi, ostavlja se).
- Email: `email_domain--scaffold_transactional_email` + custom template; trigger se zove iz `approveSubscription` preko `/lovable/email/transactional/send` s idempotency keyem `sub-activated-<subscription_id>`.
- Korisnikov email se dohvaća iz `auth.users` preko `supabaseAdmin.auth.admin.getUserById(user_id)`.

## Što NE radim
- Ne dodajem Stripe/Paddle/kartice.
- Ne dirati postojeći IBAN tok na `/pretplata` (osim male rečenice).
- Ne brišem postojeće tablice ni planove.
