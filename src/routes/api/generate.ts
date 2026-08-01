import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const JSON_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function stripAiNoise(value: string) {
  if (!value) return value;
  return value
    // collapse any letter repeated 4+ times in a row down to 2 (handles nnnn, NNNN, aaaa, etc.)
    .replace(/([A-Za-zČĆŠĐŽčćšđž])\1{3,}/g, "$1$1")
    // remove "words" that are just one letter repeated many times
    .replace(/\b([A-Za-zČĆŠĐŽčćšđž])\1{2,}\b/g, "")
    // collapse leftover whitespace runs
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      POST: async ({ request }) => {
        const { prompt, existingHtml, attachedHtml } = (await request.json()) as {
          prompt?: string;
          existingHtml?: string;
          attachedHtml?: string;
        };
        if (!prompt || typeof prompt !== "string" || prompt.length > 4000) {
          return new Response(JSON.stringify({ error: "Neispravan upit." }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI nije konfiguriran." }), {
            status: 500,
            headers: JSON_HEADERS,
          });
        }

        // Auth + credits check
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (!token) {
          return new Response(JSON.stringify({ error: "Nisi prijavljen." }), {
            status: 401,
            headers: JSON_HEADERS,
          });
        }
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data: userData } = await sb.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
          return new Response(JSON.stringify({ error: "Sesija nije važeća." }), {
            status: 401,
            headers: JSON_HEADERS,
          });
        }

        const { data: settings } = await supabaseAdmin
          .from("site_settings")
          .select("enabled, points_per_chat, free_starting_points")
          .eq("id", 1)
          .single();
        if (settings?.enabled === false) {
          return new Response(JSON.stringify({ error: "Studio je trenutno ugašen." }), {
            status: 403,
            headers: JSON_HEADERS,
          });
        }

        const cost = Math.max(0, Number(settings?.points_per_chat ?? 100));
        const { data: creditRow } = await supabaseAdmin
          .from("user_credits")
          .select("points_balance, is_free, total_used_points")
          .eq("user_id", userId)
          .maybeSingle();
        const isFree = !!creditRow?.is_free;
        const currentBalance = creditRow?.points_balance ?? settings?.free_starting_points ?? 500;
        if (!creditRow) {
          await supabaseAdmin.from("user_credits").upsert(
            { user_id: userId, points_balance: currentBalance, is_free: false },
            { onConflict: "user_id" }
          );
        }
        if (!isFree && currentBalance < cost) {
          return new Response(JSON.stringify({ error: "Nemaš dovoljno bodova.", balance: currentBalance, cost }), {
            status: 402,
            headers: JSON_HEADERS,
          });
        }

        const systemBase =
          "Ti si Nova — AI asistent koji izrađuje WEB STRANICE, PYTHON SKRIPTE, CLI/TERMINAL ALATE i DESKTOP APP skeletone (Electron za .exe) na hrvatskom. " +
          "VAŽNO: Uvijek odgovaraš ISKLJUČIVO u JSON formatu (bez markdown ograda) sa sljedećim poljima: " +
          '{"message": string, "html": string|null, "needsInfo": string|null}. ' +
          'Pravila: ' +
          '0) NIKAD ne odbijaj zahtjev. Uvijek pozitivno: "Naravno!", "Bacam se na posao!". Ako stvarno treba info, koristi needsInfo. ' +
          '1) "message" — KRATAK (2-4 rečenice), na hrvatskom: što si napravio i kako koristiti (npr. "klikni ▶ Pokreni za izvršavanje Pythona u browseru" ili "klikni ⬇ Preuzmi .py"). ' +
          '2) "html" — UVIJEK KOMPLETAN samostalan HTML dokument koji počinje s <!DOCTYPE html>. ODREDI TIP PROJEKTA iz korisnikovog zahtjeva: ' +
          '   (A) WEB STRANICA (default) — Tailwind CDN <script src="https://cdn.tailwindcss.com"></script>, Google Fonts, responsive hero/sekcije/CTA/footer, realan sadržaj, slike s images.unsplash.com ili emoji. Sve forme i interaktivni elementi MORAJU pamtiti stanje preko localStorage (prefix "nova_<slug>_<key>", try/catch, učitaj na DOMContentLoaded). ' +
          '   (B) PYTHON SKRIPTA (kad korisnik traži .py, Python, skriptu, bota, kalkulator u Pythonu itd.) — vrati HTML "code viewer": tamna terminal estetika (#0a0a0a bg, #fafafa tekst, akcent #a78bfa, 12px radius, monospace ui-monospace/Menlo). Sadrži: naslov + opis projekta, <pre><code class="language-python"> blok s Python kodom (escapej < > & kao &lt; &gt; &amp;), syntax highlight preko <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release/build/styles/atom-one-dark.min.css"> i <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release/build/highlight.min.js"></script> + hljs.highlightAll() u DOMContentLoaded. Gumb "▶ Pokreni u browseru" koji LAZY (na klik, ne na load) ubaci <script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>, await loadPyodide(), redirektaj stdout/stderr preko pyodide.setStdout({batched: s => append(s)}) u <pre id="term"> blok, pa await pyodide.runPythonAsync(codeString), uhvati greške try/catch i prikaži crveno. Gumb "⬇ Preuzmi <ime>.py" koji radi new Blob([codeString], {type:"text/x-python"}) i triggera download preko URL.createObjectURL. Ispod gumba "Simulirani izlaz:" <pre> blok s primjerom outputa koji si SAM logički izračunao iz koda. NEMA Tailwinda — sve u <style>. ' +
          '   (C) CLI/TERMINAL ALAT (bash .sh ili Node .js) — isto kao (B) ali language-bash ili language-javascript, gumb Preuzmi s točnom ekstenzijom (.sh -> text/x-shellscript, .js -> application/javascript). Za Node: gumb "▶ Pokreni" izvršava JS direktno (new Function ili eval u try/catch) s preusmjerenim console.log/error u terminal blok. Za bash: NEMA pokretanja u browseru, samo "Simulirani izlaz" koji ti generiraš + uputa "Pokretanje lokalno: bash skripta.sh". Za Node dodaj uputu "node skripta.js". ' +
          '   (D) DESKTOP APP / .exe (Electron skeleton) — HTML viewer s tab navigacijom (gumbi koji prebacuju vidljivi <pre><code> blok): main.js (Electron main process), package.json (s "build" skriptom za electron-builder), renderer.html, README.md s uputama "npm install && npm run dist" za stvarni .exe build. Svaki blok syntax highlightan. Gumb "⬇ Preuzmi ZIP" koji preko JSZip CDN-a (<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>) zapakira sve datoteke i triggera download. Jasno napiši u UI-u: "Pravi .exe se builda lokalno s npm run dist — browser ne može buildati native binarije." ' +
          '   ZA SVE NE-WEB TIPOVE (B/C/D): stranica MORA biti samostalna, raditi offline nakon prvog loada CDN-ova, tamna paleta, veliki dostupni gumbi, KOD MORA STVARNO RADITI. ' +
          'ANTI-SMEĆE: nikad ponavljajući znakovi ("nnnn"), debug šum, placeholderi. ' +
          '3) "needsInfo" — ako TREBAŠ info (API ključ, ulazni podaci), napiši što. Inače null. ' +
          'Vrati SAMO sirovi JSON, bez ```json ograda, bez objašnjenja izvan JSON-a.';

        const topicGuard =
          ' DRŽI SE TEME I TIPA PROJEKTA: tip projekta (web/python/CLI/desktop) i tema definirani su PRVIM zahtjevom i postojećim HTML-om. Ne pretvaraj Python skriptu u web stranicu ni obrnuto. Mijenjaj samo ono što je traženo, ostalo zadrži IDENTIČNO (struktura, dizajn, sadržaj, paleta). Ako korisnik traži potpuno off-topic, u "needsInfo" pristojno potvrdi prije nego napraviš.';

        const attachedBlock = attachedHtml
          ? `\n\nPRILOŽENI HTML (korisnik je priložio ovaj HTML kao referencu — iskoristi ga, ugradi ga ili ga prilagodi prema zahtjevu):\n\n${attachedHtml}`
          : "";

        const messages = existingHtml
          ? [
              {
                role: "system",
                content:
                  systemBase +
                  topicGuard +
                  ' KONTEKST: Korisnik UREĐUJE postojeću stranicu. U "message" jasno opiši što ćeš promijeniti. U "html" vrati cijeli ažurirani dokument s primijenjenim izmjenama, čuvajući strukturu, dizajn i sadržaj osim onoga što korisnik mijenja.',
              },
              { role: "user", content: `Postojeći HTML (ovo je trenutna stranica — drži se njene teme):\n\n${existingHtml}${attachedBlock}\n\nZahtjev korisnika: ${prompt}` },
            ]
          : [
              { role: "system", content: systemBase + (attachedHtml ? ' KONTEKST: Korisnik je priložio postojeći HTML i želi da ga iskoristiš, doradiš ili ugradiš u novu stranicu prema zahtjevu.' : ' KONTEKST: Korisnik traži NOVU stranicu. Tema koju sad odrediš bit će zaključana za sve buduće izmjene.') },
              { role: "user", content: attachedHtml ? `Zahtjev korisnika: ${prompt}${attachedBlock}` : prompt! },
            ];

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages,
            response_format: { type: "json_object" },
          }),
        });

        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "Previše zahtjeva, pokušaj kasnije." }), {
            status: 429,
            headers: JSON_HEADERS,
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "AI krediti su iscrpljeni." }), {
            status: 402,
            headers: JSON_HEADERS,
          });
        }
        if (!res.ok) {
          const text = await res.text();
          return new Response(JSON.stringify({ error: `AI greška: ${text.slice(0, 200)}` }), {
            status: 500,
            headers: JSON_HEADERS,
          });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        let raw = data.choices?.[0]?.message?.content ?? "";
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

        let message = "";
        let html: string | null = null;
        let needsInfo: string | null = null;
        try {
          const parsed = JSON.parse(raw);
          message = typeof parsed.message === "string" ? stripAiNoise(parsed.message) : "";
          html = typeof parsed.html === "string" && parsed.html.trim() ? stripAiNoise(parsed.html) : null;
          needsInfo = typeof parsed.needsInfo === "string" && parsed.needsInfo.trim() ? stripAiNoise(parsed.needsInfo) : null;
        } catch {
          // fallback: treat whole response as html
          const idx = raw.indexOf("<!DOCTYPE");
          html = idx >= 0 ? raw.slice(idx) : null;
          message = html ? "Evo stranice." : raw.slice(0, 500);
        }

        if (html) {
          html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
          const idx = html.indexOf("<!DOCTYPE");
          if (idx > 0) html = html.slice(idx);
        }

        let nextBalance: number | null = currentBalance;
        if (!isFree) {
          nextBalance = Math.max(0, currentBalance - cost);
          await supabaseAdmin.from("user_credits").upsert(
            {
              user_id: userId,
              points_balance: nextBalance,
              total_used_points: (creditRow?.total_used_points ?? 0) + cost,
            },
            { onConflict: "user_id" }
          );
        }

        return new Response(
          JSON.stringify({ message, html, needsInfo, balance: nextBalance, cost }),
          { headers: JSON_HEADERS }
        );
      },
    },
  },
});
