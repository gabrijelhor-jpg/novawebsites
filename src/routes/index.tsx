import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUp, Sparkles, Zap, Code2, Globe, Wand2, Github, Twitter } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Index,
});

const prompts = [
  "Landing stranica za kafić u Splitu",
  "Portfolio za fotografa vjenčanja",
  "Webshop za ručno rađene svijeće",
  "SaaS dashboard za freelancere",
];

function Index() {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  const start = () => {
    if (prompt.trim()) {
      try {
        sessionStorage.setItem("nova:firstPrompt", prompt);
      } catch {}
    }
    navigate({ to: user ? "/app" : "/auth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-accent shadow-glow grid place-items-center">
              <Sparkles className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-display text-2xl">Nova</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#kako" className="hover:text-foreground transition">Kako radi</a>
            <a href="#mogucnosti" className="hover:text-foreground transition">Mogućnosti</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/app"
                className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-full hover:opacity-90 transition shadow-soft"
              >
                Otvori studio
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition">
                  Prijava
                </Link>
                <Link
                  to="/auth"
                  className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-full hover:opacity-90 transition shadow-soft"
                >
                  Započni
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-hero relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-card border border-border shadow-soft mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-muted-foreground">Pokrenuto Lovable AI-em · Brzina koju ćeš osjetiti</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl leading-[1.05] mb-8">
            Izradi web stranicu
            <br />
            <span className="text-gradient italic">razgovorom.</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
            Opiši što želiš. Nova izradi dizajn, kod i sadržaj — sve u sekundama.
            Spremi svoje stranice i uređuj ih s AI-em kad god želiš.
          </p>

          {/* Prompt box */}
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-3xl shadow-soft p-2 hover:shadow-glow transition-shadow">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") start();
                }}
                placeholder="Opiši svoju ideju... npr. 'Stranica za jogu studio s rasporedom satova'"
                rows={3}
                className="w-full resize-none bg-transparent px-5 pt-4 pb-2 outline-none text-foreground placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <span className="text-xs text-muted-foreground">
                  {user ? "Otvori studio i kreni" : "Registracija je besplatna"}
                </span>
                <button
                  onClick={start}
                  className="w-10 h-10 rounded-full bg-gradient-accent grid place-items-center shadow-glow hover:scale-105 transition"
                >
                  <ArrowUp className="w-5 h-5 text-accent-foreground" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="text-xs px-3 py-1.5 rounded-full bg-card/60 border border-border hover:border-accent hover:text-foreground text-muted-foreground transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="kako" className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-sm text-accent uppercase tracking-widest mb-3">Kako radi</p>
            <h2 className="text-4xl md:text-6xl">Od ideje do stranice u tri koraka.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", icon: Wand2, t: "Opiši", d: "Reci Novi što gradiš — stil, sadržaj, cilj. Razgovaraj prirodno." },
              { n: "02", icon: Zap, t: "Generiraj", d: "Nova izradi cijelu stranicu u nekoliko sekundi i sprema je u tvoj račun." },
              { n: "03", icon: Globe, t: "Uređuj", d: "Nastavi razgovor s AI-em da uglađuješ tekst, boje i sekcije." },
            ].map((s) => (
              <div key={s.n} className="bg-card border border-border rounded-3xl p-8 hover:shadow-glow transition-all hover:-translate-y-1">
                <div className="flex items-center justify-between mb-12">
                  <span className="text-xs text-muted-foreground tracking-widest">{s.n}</span>
                  <s.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-2xl mb-2">{s.t}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="mogucnosti" className="py-32 px-6 bg-secondary/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-sm text-accent uppercase tracking-widest mb-3">Mogućnosti</p>
            <h2 className="text-4xl md:text-6xl">Sve što ti treba. Ništa što ne treba.</h2>
          </div>

          <div className="grid md:grid-cols-3 grid-rows-2 gap-4 auto-rows-[220px]">
            <div className="md:col-span-2 md:row-span-2 bg-card border border-border rounded-3xl p-10 flex flex-col justify-between overflow-hidden relative group">
              <div>
                <Code2 className="w-8 h-8 text-accent mb-4" />
                <h3 className="text-3xl mb-3">Tvoja knjižnica izrada.</h3>
                <p className="text-muted-foreground max-w-md">
                  Sve što napraviš sprema se pod tvoj račun. Vrati se kad god želiš i nastavi uređivati razgovorom s AI-em.
                </p>
              </div>
              <div className="font-mono text-xs bg-background/60 border border-border rounded-xl p-4 text-muted-foreground">
                <div><span className="text-accent">ti</span>: "promijeni boju u plavu i dodaj kontakt formu"</div>
                <div><span className="text-accent">nova</span>: stranica ažurirana <span className="opacity-50">// → 1.8s</span></div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8">
              <Sparkles className="w-6 h-6 text-accent mb-4" />
              <h3 className="text-xl mb-2">AI dizajner</h3>
              <p className="text-sm text-muted-foreground">Tipografija, paleta i ritam birani sa stvarnim ukusom.</p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8">
              <Globe className="w-6 h-6 text-accent mb-4" />
              <h3 className="text-xl mb-2">HTML izvoz</h3>
              <p className="text-sm text-muted-foreground">Preuzmi gotovu stranicu jednim klikom i objavi je gdje god želiš.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto bg-primary text-primary-foreground rounded-[2.5rem] p-16 text-center relative overflow-hidden shadow-glow">
          <div className="absolute inset-0 bg-gradient-accent opacity-20" />
          <div className="relative">
            <h2 className="text-4xl md:text-6xl mb-6">Tvoja sljedeća stranica je rečenica daleko.</h2>
            <p className="opacity-80 max-w-xl mx-auto mb-10">
              Registriraj se, opiši ideju i Nova radi ostalo. Sve tvoje stranice ostaju spremljene.
            </p>
            <Link
              to={user ? "/app" : "/auth"}
              className="bg-accent text-accent-foreground px-8 py-4 rounded-full text-base font-medium hover:scale-105 transition inline-flex items-center gap-2"
            >
              {user ? "Otvori studio" : "Započni besplatno"}
              <ArrowUp className="w-4 h-4 rotate-45" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-accent grid place-items-center">
              <Sparkles className="w-3 h-3 text-accent-foreground" />
            </div>
            <span className="font-display text-lg">Nova</span>
            <span className="text-sm text-muted-foreground ml-2">© 2026</span>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <a href="#" className="hover:text-foreground transition"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="hover:text-foreground transition"><Github className="w-4 h-4" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
