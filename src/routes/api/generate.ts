import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, existingHtml } = (await request.json()) as {
          prompt?: string;
          existingHtml?: string;
        };
        if (!prompt || typeof prompt !== "string" || prompt.length > 4000) {
          return new Response(JSON.stringify({ error: "Neispravan upit." }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI nije konfiguriran." }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const systemBase =
          "Ti si Nova — AI asistent koji izrađuje i uređuje web stranice na hrvatskom. " +
          "VAŽNO: Uvijek odgovaraš ISKLJUČIVO u JSON formatu (bez markdown ograda) sa sljedećim poljima: " +
          '{"message": string, "html": string|null, "needsInfo": string|null}. ' +
          'Pravila: ' +
          '0) NIKAD ne odbijaj zahtjev. NIKAD ne pišeš "nažalost", "ne mogu", "nisam u mogućnosti", "to ne mogu napraviti". Uvijek si pozitivan i poletan: "Naravno!", "Bacam se na posao!", "Odmah radim!", "Super ideja, evo ga!". Ako nešto stvarno ne ide, pitaj korisnika za info preko needsInfo umjesto da odbiješ. ' +
          '1) "message" — KRATAK, prijateljski opis (2-4 rečenice) na hrvatskom što si napravio ili što planiraš, uvijek u pozitivnom tonu. Pričaj kao kolega developer koji se baca na posao. ' +
          '2) "html" — KOMPLETAN samostalan HTML dokument koji počinje s <!DOCTYPE html>. Tailwind preko CDN <script src="https://cdn.tailwindcss.com"></script>, Google Fonts, moderan responsive dizajn s hero/značajkama/CTA/footerom, realan sadržaj, slike s images.unsplash.com ili emoji. ' +
          'MEMORIJA: Stranice MORAJU pamtiti stanje preko localStorage. Za SVAKI <form>, <input>, <textarea>, košaricu, brojač posjeta, todo listu, komentare, postavke (dark mode), korisničke unose i bilo koji interaktivni element — UVIJEK dodaj <script> koji sprema u localStorage (s prefixom imena stranice, npr. "nova_<slug>_<key>") i učitava natrag pri svakom otvaranju stranice (DOMContentLoaded). Forme sprema unose i prikazuju zadnje poslane poruke. Dodaj try/catch oko localStorage poziva. ' +
          '3) "needsInfo" — ako ti TREBA nešto od korisnika (API ključ, tekst, podaci, slike, link) prije nego što možeš napraviti, ovdje napiši ŠTO točno trebaš, prijateljski. Inače null. Ako needsInfo nije null, html može biti null. ' +
          'Vrati SAMO sirovi JSON, bez ```json ograda, bez objašnjenja izvan JSON-a.';

        const topicGuard =
          ' DRŽI SE TEME: Tema/svrha stranice je definirana PRVIM korisničkim zahtjevom i postojećim HTML-om. Sve buduće izmjene moraju ostati U KONTEKSTU te teme — ne mijenjaj tip stranice (npr. ako je restoran, ne pretvaraj ga u tech blog), ne briši cijele postojeće sekcije osim ako korisnik to izričito traži, čuvaj brand, ton, paletu boja, fontove i postojeći sadržaj. Mijenjaj samo ono što je traženo, ostalo zadrži IDENTIČNO. Ako korisnik traži nešto potpuno off-topic (npr. na stranici za pizzeriju traži "dodaj kalkulator hipoteke"), u "needsInfo" pristojno potvrdi želi li to stvarno na ovoj stranici prije nego napraviš.';

        const messages = existingHtml
          ? [
              {
                role: "system",
                content:
                  systemBase +
                  topicGuard +
                  ' KONTEKST: Korisnik UREĐUJE postojeću stranicu. U "message" jasno opiši što ćeš promijeniti. U "html" vrati cijeli ažurirani dokument s primijenjenim izmjenama, čuvajući strukturu, dizajn i sadržaj osim onoga što korisnik mijenja.',
              },
              { role: "user", content: `Postojeći HTML (ovo je trenutna stranica — drži se njene teme):\n\n${existingHtml}\n\nZahtjev korisnika: ${prompt}` },
            ]
          : [
              { role: "system", content: systemBase + ' KONTEKST: Korisnik traži NOVU stranicu. Tema koju sad odrediš bit će zaključana za sve buduće izmjene.' },
              { role: "user", content: prompt },
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
            headers: { "content-type": "application/json" },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "AI krediti su iscrpljeni." }), {
            status: 402,
            headers: { "content-type": "application/json" },
          });
        }
        if (!res.ok) {
          const text = await res.text();
          return new Response(JSON.stringify({ error: `AI greška: ${text.slice(0, 200)}` }), {
            status: 500,
            headers: { "content-type": "application/json" },
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
          message = typeof parsed.message === "string" ? parsed.message : "";
          html = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null;
          needsInfo = typeof parsed.needsInfo === "string" && parsed.needsInfo.trim() ? parsed.needsInfo : null;
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

        return new Response(JSON.stringify({ message, html, needsInfo }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
