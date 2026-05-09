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
          "Ti si Nova — generiraš KOMPLETNU, samostalnu web stranicu kao jedan HTML dokument na hrvatskom. Pravila: 1) Vrati ISKLJUČIVO sirovi HTML počevši s <!DOCTYPE html>, bez markdown ograda, bez objašnjenja. 2) Tailwind preko <script src='https://cdn.tailwindcss.com'></script>. 3) Google Fonts (npr. Inter + Instrument Serif). 4) Moderan dizajn s hero, značajkama, CTA, footerom. 5) Realan sadržaj prilagođen upitu. 6) Slike s https://images.unsplash.com/... ili emoji. 7) Responsive.";

        const messages = existingHtml
          ? [
              {
                role: "system",
                content:
                  systemBase +
                  " VAŽNO: Korisnik već ima postojeću stranicu i traži IZMJENU. Vrati cijeli novi HTML s primijenjenim izmjenama, čuvajući strukturu i ton osim ako je traženo drugačije.",
              },
              { role: "user", content: `Postojeći HTML:\n\n${existingHtml}\n\nIzmjena: ${prompt}` },
            ]
          : [
              { role: "system", content: systemBase },
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
        let content = data.choices?.[0]?.message?.content ?? "";
        content = content.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
        const idx = content.indexOf("<!DOCTYPE");
        if (idx > 0) content = content.slice(idx);

        return new Response(JSON.stringify({ content }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
