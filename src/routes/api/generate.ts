import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || typeof prompt !== "string" || prompt.length > 2000) {
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

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "Ti si Nova, AI asistent koji u 4-6 kratkih natuknica predlaže strukturu web stranice na hrvatskom: sekcije, ton i CTA. Bez markdowna, bez uvoda — samo natuknice odvojene znakom •.",
              },
              { role: "user", content: prompt },
            ],
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
        const content = data.choices?.[0]?.message?.content ?? "";

        return new Response(JSON.stringify({ content }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
