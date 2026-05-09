import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUp, Sparkles, Loader2, Plus, LogOut, Download, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

type Generation = {
  id: string;
  title: string;
  prompt: string;
  html: string;
  created_at: string;
};

function AppPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Generation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    try {
      const seed = sessionStorage.getItem("nova:firstPrompt");
      if (seed) {
        setPrompt(seed);
        sessionStorage.removeItem("nova:firstPrompt");
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("generations")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data as Generation[]);
      });
  }, [user]);

  const active = items.find((i) => i.id === activeId) ?? null;

  const generate = async () => {
    if (!prompt.trim() || loading || !user) return;
    setLoading(true);
    setError("");
    const isEdit = active !== null;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          existingHtml: isEdit ? active!.html : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Greška");
        return;
      }
      const html = data.content as string;

      if (isEdit && active) {
        const { data: updated, error } = await supabase
          .from("generations")
          .update({ html, prompt: active.prompt + "\n\n→ " + prompt })
          .eq("id", active.id)
          .select()
          .single();
        if (error) throw error;
        setItems((prev) => prev.map((i) => (i.id === active.id ? (updated as Generation) : i)));
      } else {
        const title = prompt.slice(0, 60);
        const { data: inserted, error } = await supabase
          .from("generations")
          .insert({ user_id: user.id, title, prompt, html })
          .select()
          .single();
        if (error) throw error;
        const row = inserted as Generation;
        setItems((prev) => [row, ...prev]);
        setActiveId(row.id);
      }
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  const newPage = () => {
    setActiveId(null);
    setPrompt("");
    setError("");
  };

  const remove = async (id: string) => {
    await supabase.from("generations").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-accent grid place-items-center">
              <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
            </div>
            <span className="font-display text-xl">Nova</span>
          </Link>
        </div>

        <div className="p-3">
          <button
            onClick={newPage}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> Nova stranica
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground px-2 py-2">
            Tvoje izrade
          </p>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4">Još ništa. Napravi prvu!</p>
          )}
          {items.map((it) => (
            <div
              key={it.id}
              className={`group flex items-center gap-1 rounded-lg mb-0.5 ${
                activeId === it.id ? "bg-secondary" : "hover:bg-secondary/60"
              }`}
            >
              <button
                onClick={() => {
                  setActiveId(it.id);
                  setPrompt("");
                }}
                className="flex-1 text-left px-3 py-2 text-sm truncate"
              >
                {it.title}
              </button>
              <button
                onClick={() => remove(it.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                title="Obriši"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            <button
              onClick={logout}
              title="Odjava"
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <div className="border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-muted-foreground">
              {active ? "Uređuješ" : "Nova izrada"}
            </span>
            {active && (
              <span className="font-medium truncate flex items-center gap-2">
                · <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> {active.title}
              </span>
            )}
          </div>
          {active && (
            <a
              href={`data:text/html;charset=utf-8,${encodeURIComponent(active.html)}`}
              download={`${active.title || "nova"}.html`}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
            >
              <Download className="w-3.5 h-3.5" /> Preuzmi HTML
            </a>
          )}
        </div>

        <div className="flex-1 overflow-hidden bg-secondary/40 p-4">
          {active ? (
            <iframe
              title="Preview"
              srcDoc={active.html}
              className="w-full h-full rounded-2xl bg-white border border-border shadow-soft"
              sandbox="allow-scripts"
            />
          ) : (
            <div className="h-full grid place-items-center">
              <div className="text-center max-w-md">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-accent grid place-items-center shadow-glow">
                  <Sparkles className="w-6 h-6 text-accent-foreground" />
                </div>
                <h2 className="text-3xl mb-2">Opiši svoju ideju</h2>
                <p className="text-sm text-muted-foreground">
                  Nova će izraditi cijelu stranicu. Klikni na neku iz povijesti da nastaviš s
                  uređivanjem.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto bg-card border border-border rounded-2xl shadow-soft p-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
              }}
              placeholder={
                active
                  ? "Što da promijenim? npr. 'dodaj sekciju s recenzijama, promijeni boju u plavu'"
                  : "Opiši stranicu... npr. 'Stranica za jogu studio s rasporedom satova'"
              }
              rows={2}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 outline-none text-sm placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-[11px] text-muted-foreground">⌘ + Enter</span>
              <button
                onClick={generate}
                disabled={loading || !prompt.trim()}
                className="w-9 h-9 rounded-full bg-gradient-accent grid place-items-center shadow-glow hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 text-accent-foreground animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4 text-accent-foreground" />
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-destructive text-center mt-2">{error}</p>}
        </div>
      </main>
    </div>
  );
}
