import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Loader2, Plus, LogOut, Download, Trash2, Pencil, Bot, User as UserIcon, AlertCircle, Paperclip, X, FileCode, Menu, Eye, MessageSquare } from "lucide-react";
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

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  needsInfo?: boolean;
};

function AppPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Generation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  // chats key: generation id, or "__new" for the not-yet-saved draft
  const NEW_KEY = "__new";
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedHtml, setAttachedHtml] = useState<string | null>(null);
  const [attachedName, setAttachedName] = useState<string>("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [isFree, setIsFree] = useState(false);
  const [pricing, setPricing] = useState<{ points_per_chat: number; cents_per_1000_points: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");

  const onPickFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setAttachedHtml(text.slice(0, 200_000));
      setAttachedName(file.name);
    };
    reader.readAsText(file);
  };

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

  // Load persisted chats from localStorage on mount
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`nova:chats:${user.id}`);
      if (raw) setChats(JSON.parse(raw));
    } catch {}
  }, [user]);

  // Persist chats whenever they change
  useEffect(() => {
    if (!user) return;
    try {
      localStorage.setItem(`nova:chats:${user.id}`, JSON.stringify(chats));
    } catch {}
  }, [chats, user]);

  // Load credits + pricing
  useEffect(() => {
    if (!user) return;
    supabase.from("user_credits").select("points_balance, is_free").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setBalance(data.points_balance ?? 0); setIsFree(!!data.is_free); }
    });
    supabase.from("site_settings").select("points_per_chat, cents_per_1000_points").eq("id", 1).single().then(({ data }) => {
      if (data) setPricing({ points_per_chat: data.points_per_chat, cents_per_1000_points: data.cents_per_1000_points });
    });
  }, [user]);

  const active = items.find((i) => i.id === activeId) ?? null;
  const chatKey = activeId ?? NEW_KEY;
  const messages = chats[chatKey] ?? [];

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const pushMessage = (key: string, msg: ChatMessage) => {
    setChats((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));
  };

  const generate = async () => {
    if (!prompt.trim() || loading || !user) return;
    const userText = prompt.trim();
    setLoading(true);
    setError("");
    const isEdit = active !== null;
    const startKey = chatKey;
    const userTextDisplay = attachedHtml
      ? `${userText}\n\n📎 ${attachedName || "priloženi.html"}`
      : userText;
    pushMessage(startKey, { role: "user", text: userTextDisplay });
    setPrompt("");
    const sentAttached = attachedHtml;
    setAttachedHtml(null);
    setAttachedName("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: userText,
          existingHtml: isEdit ? active!.html : undefined,
          attachedHtml: sentAttached ?? undefined,
        }),
      });
      const data = await res.json();
      if (typeof data.balance === "number") setBalance(data.balance);
      if (!res.ok) {
        setError(data.error ?? "Greška");
        pushMessage(startKey, { role: "assistant", text: data.error ?? "Greška" });
        return;
      }

      const clean = (s: string) =>
        s
          .replace(/\\r\\n/g, "\n")
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");

      const aiMessage: string = clean(data.message || (data.html ? "Gotovo." : ""));
      const html: string | null = data.html;
      const needsInfo: string | null = data.needsInfo ? clean(data.needsInfo) : null;

      if (needsInfo && !html) {
        pushMessage(startKey, {
          role: "assistant",
          text: `${aiMessage}\n\n${needsInfo}`,
          needsInfo: true,
        });
        return;
      }

      if (!html) {
        pushMessage(startKey, { role: "assistant", text: aiMessage || "Nisam mogao generirati stranicu." });
        return;
      }

      if (isEdit && active) {
        const { data: updated, error } = await supabase
          .from("generations")
          .update({ html, prompt: active.prompt + "\n\n→ " + userText })
          .eq("id", active.id)
          .select()
          .single();
        if (error) throw error;
        setItems((prev) => prev.map((i) => (i.id === active.id ? (updated as Generation) : i)));
        pushMessage(startKey, { role: "assistant", text: aiMessage });
      } else {
        const title = userText.slice(0, 60);
        const { data: inserted, error } = await supabase
          .from("generations")
          .insert({ user_id: user.id, title, prompt: userText, html })
          .select()
          .single();
        if (error) throw error;
        const row = inserted as Generation;
        setItems((prev) => [row, ...prev]);
        // migrate draft chat onto the new generation id
        setChats((prev) => {
          const draft = prev[NEW_KEY] ?? [];
          const next = { ...prev };
          delete next[NEW_KEY];
          next[row.id] = [...draft, { role: "assistant", text: aiMessage }];
          return next;
        });
        setActiveId(row.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Greška";
      setError(msg);
      pushMessage(startKey, { role: "assistant", text: msg });
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
    setChats((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed md:static z-40 inset-y-0 left-0 w-72 border-r border-border flex flex-col bg-card transform transition-transform md:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
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

        <div className="p-3 border-t border-border space-y-2">
          {balance !== null && (
            <div className="px-2 py-2 rounded-lg bg-secondary/60 text-xs">
              {isFree ? (
                <span className="text-emerald-600 dark:text-emerald-400">✦ Besplatan pristup</span>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Bodovi</span>
                    <span className="font-medium">{balance.toLocaleString("hr-HR")}</span>
                  </div>
                  {pricing && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {pricing.points_per_chat} bodova / chat · {pricing.cents_per_1000_points}¢ za 1000
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2">
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
      <main className="flex-1 flex flex-col min-w-0">
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

        {/* Split: chat + preview */}
        <div className="flex-1 flex min-h-0">
          {/* Chat panel */}
          <div className="w-[380px] border-r border-border flex flex-col bg-card/20 min-h-0">
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !loading && (
                <div className="text-center text-xs text-muted-foreground py-8">
                  {active
                    ? "Reci Novi što želiš promijeniti."
                    : "Opiši svoju ideju — Nova će ti odgovoriti i izraditi stranicu."}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`w-7 h-7 shrink-0 rounded-full grid place-items-center ${
                      m.role === "user"
                        ? "bg-secondary text-foreground"
                        : "bg-gradient-accent text-accent-foreground"
                    }`}
                  >
                    {m.role === "user" ? (
                      <UserIcon className="w-3.5 h-3.5" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[280px] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : m.needsInfo
                          ? "bg-amber-500/10 border border-amber-500/30 text-foreground rounded-tl-sm"
                          : "bg-secondary text-foreground rounded-tl-sm"
                    }`}
                  >
                    {m.needsInfo && (
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">
                        <AlertCircle className="w-3 h-3" /> Trebam info
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 shrink-0 rounded-full grid place-items-center bg-gradient-accent text-accent-foreground">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-secondary rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-muted-foreground">Nova razmišlja…</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border p-3">
              {attachedHtml && (
                <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/70 border border-border text-xs">
                  <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate flex-1">{attachedName || "priloženi.html"}</span>
                  <span className="text-muted-foreground">{Math.ceil(attachedHtml.length / 1024)} KB</span>
                  <button
                    onClick={() => { setAttachedHtml(null); setAttachedName(""); }}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Ukloni"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {pasteOpen && (
                <div className="mb-2 rounded-lg border border-border bg-card p-2">
                  <textarea
                    value={pasteValue}
                    onChange={(e) => setPasteValue(e.target.value)}
                    placeholder="Zalijepi HTML ovdje…"
                    rows={5}
                    className="w-full resize-none bg-transparent px-2 py-1.5 outline-none text-xs font-mono placeholder:text-muted-foreground"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => { setPasteOpen(false); setPasteValue(""); }}
                      className="text-xs px-2.5 py-1 rounded hover:bg-secondary text-muted-foreground"
                    >Odustani</button>
                    <button
                      onClick={() => {
                        if (pasteValue.trim()) {
                          setAttachedHtml(pasteValue.slice(0, 200_000));
                          setAttachedName("zaljepljeni.html");
                        }
                        setPasteOpen(false);
                        setPasteValue("");
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
                    >Priloži</button>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickFile(f);
                  e.target.value = "";
                }}
              />
              <div className="bg-card border border-border rounded-2xl shadow-soft p-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
                  }}
                  placeholder={
                    active
                      ? "Što da promijenim?"
                      : "Opiši stranicu…"
                  }
                  rows={2}
                  className="w-full resize-none bg-transparent px-3 pt-2 pb-1 outline-none text-sm placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between px-1.5 pb-0.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Priloži HTML datoteku"
                      className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPasteOpen((v) => !v)}
                      title="Zalijepi HTML"
                      className={`p-1.5 rounded-full hover:bg-secondary transition ${pasteOpen ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <FileCode className="w-4 h-4" />
                    </button>
                    <span className="text-[11px] text-muted-foreground ml-1">⌘ + Enter</span>
                  </div>
                  <button
                    onClick={generate}
                    disabled={loading || !prompt.trim()}
                    className="w-8 h-8 rounded-full bg-gradient-accent grid place-items-center shadow-glow hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
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
          </div>

          {/* Preview panel */}
          <div className="flex-1 overflow-hidden bg-secondary/40 p-4 min-w-0">
            {active ? (
              <iframe
                title="Preview"
                srcDoc={active.html}
                className="w-full h-full rounded-2xl bg-white border border-border shadow-soft"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="h-full grid place-items-center">
                <div className="text-center max-w-md">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-accent grid place-items-center shadow-glow">
                    <Sparkles className="w-6 h-6 text-accent-foreground" />
                  </div>
                  <h2 className="text-3xl mb-2">Opiši svoju ideju</h2>
                  <p className="text-sm text-muted-foreground">
                    Nova će ti odgovoriti u chatu i izraditi cijelu stranicu.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
