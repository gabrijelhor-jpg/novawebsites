import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Loader2, Plus, LogOut, Download, Trash2, Pencil, Bot, User as UserIcon, AlertCircle, Paperclip, X, FileCode, Menu, Eye, MessageSquare, History, RotateCcw, Globe2, Copy, Github, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import JSZip from "jszip";

export const Route = createFileRoute("/app")({
  component: AppPage,
});

type Generation = {
  id: string;
  title: string;
  prompt: string;
  html: string;
  created_at: string;
  public_slug?: string | null;
  is_published?: boolean;
  published_at?: string | null;
};

type Version = {
  id: string;
  generation_id: string;
  html: string;
  prompt: string;
  label: string;
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
  const [versions, setVersions] = useState<Version[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [actionMsg, setActionMsg] = useState("");

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

  const makeSlug = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9čćžšđ\s-]/gi, "")
      .replace(/[čć]/g, "c")
      .replace(/ž/g, "z")
      .replace(/š/g, "s")
      .replace(/đ/g, "d")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);

  const cleanTitle = (value: string) =>
    value.replace(/[nN]{4,}/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "Nova stranica";

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  useEffect(() => {
    setSlug(active?.public_slug ?? makeSlug(active?.title ?? ""));
    setActionMsg("");
  }, [active?.id, active?.public_slug, active?.title]);

  useEffect(() => {
    if (!activeId || !user) {
      setVersions([]);
      return;
    }
    (supabase.from("generation_versions") as any)
      .select("*")
      .eq("generation_id", activeId)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Version[] | null }) => setVersions(data ?? []));
  }, [activeId, user]);

  const pushMessage = (key: string, msg: ChatMessage) => {
    setChats((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg] }));
  };

  const rememberVersion = async (item: Generation, label: string) => {
    if (!user) return;
    await (supabase.from("generation_versions") as any).insert({
      generation_id: item.id,
      user_id: user.id,
      html: item.html,
      prompt: item.prompt,
      label,
    });
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
        await rememberVersion(active, `Prije: ${userText.slice(0, 36)}`);
        const { data: updated, error } = await supabase
          .from("generations")
          .update({ html, prompt: active.prompt + "\n\n→ " + userText })
          .eq("id", active.id)
          .select()
          .single();
        if (error) throw error;
        setItems((prev) => prev.map((i) => (i.id === active.id ? (updated as Generation) : i)));
        pushMessage(startKey, { role: "assistant", text: aiMessage });
        setVersions((prev) => [
          {
            id: crypto.randomUUID(),
            generation_id: active.id,
            html: active.html,
            prompt: active.prompt,
            label: `Prije: ${userText.slice(0, 36)}`,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        const title = cleanTitle(userText);
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
        setMobileTab("preview");
        await (supabase.from("generation_versions") as any).insert({
          generation_id: row.id,
          user_id: user.id,
          html: row.html,
          prompt: row.prompt,
          label: "Prva verzija",
        });
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

  const downloadZip = async (gitReady = false) => {
    if (!active) return;
    const css = Array.from(active.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1]).join("\n\n");
    const js = Array.from(active.html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]).join("\n\n");
    const html = active.html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace("</head>", '  <link rel="stylesheet" href="styles.css">\n</head>')
      .replace("</body>", '  <script src="script.js"></script>\n</body>');
    const zip = new JSZip();
    zip.file("index.html", html);
    zip.file("styles.css", css || "/* CSS je već preko CDN-a ili inline klasa. */\n");
    zip.file("script.js", js || "// JavaScript za stranicu.\n");
    zip.file("original.html", active.html);
    zip.file("README.md", `# ${active.title}\n\nExportirano iz Nova studija.\n\n## Pokretanje\nOtvori index.html u browseru ili deployaj folder na bilo koji static hosting.\n`);
    if (gitReady) {
      zip.file(".gitignore", "node_modules\n.DS_Store\ndist\n");
      zip.file("package.json", JSON.stringify({ scripts: { dev: "vite --host 0.0.0.0", build: "vite build", preview: "vite preview" }, dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", typescript: "latest" }, devDependencies: {} }, null, 2));
      zip.file("src/main.js", "import '../styles.css';\n");
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${makeSlug(active.title) || "nova-stranica"}${gitReady ? "-git" : ""}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const publish = async () => {
    if (!active) return;
    const cleanSlug = makeSlug(slug || active.public_slug || active.title);
    if (!cleanSlug) {
      setActionMsg("Upiši ispravno ime stranice.");
      return;
    }
    setActionMsg("");
    const { data, error } = await supabase
      .from("generations")
      .update({ public_slug: cleanSlug, is_published: true, published_at: new Date().toISOString() } as any)
      .eq("id", active.id)
      .select()
      .single();
    if (error) {
      setActionMsg(error.message.includes("duplicate") ? "To ime je već zauzeto." : error.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === active.id ? (data as Generation) : i)));
    setSlug(cleanSlug);
    setActionMsg(`Objavljeno na /${cleanSlug}`);
  };

  const restoreVersion = async (version: Version) => {
    if (!active) return;
    await rememberVersion(active, "Prije vraćanja verzije");
    const { data, error } = await supabase
      .from("generations")
      .update({ html: version.html, prompt: `${active.prompt}\n\n→ Vraćeno na: ${version.label}` })
      .eq("id", active.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === active.id ? (data as Generation) : i)));
    pushMessage(active.id, { role: "assistant", text: `Vratio sam verziju: ${version.label}` });
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
                  setSidebarOpen(false);
                  setMobileTab("preview");
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
        <div className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 rounded hover:bg-secondary text-muted-foreground"
              title="Izbornik"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {active ? "Uređuješ" : "Nova izrada"}
            </span>
            {active && (
              <span className="font-medium truncate flex items-center gap-2 text-sm">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{active.title}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile tab switcher */}
            {active && (
              <div className="md:hidden flex items-center rounded-full border border-border p-0.5 bg-card">
                <button
                  onClick={() => setMobileTab("chat")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition ${
                    mobileTab === "chat" ? "bg-secondary text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Chat
                </button>
                <button
                  onClick={() => setMobileTab("preview")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition ${
                    mobileTab === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
              </div>
            )}
            {active && (
              <>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="text-xs hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
                >
                  <History className="w-3.5 h-3.5" /> Povijest
                </button>
                <button
                  onClick={() => setPublishOpen((v) => !v)}
                  className="text-xs hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
                >
                  <Globe2 className="w-3.5 h-3.5" /> Hostaj
                </button>
                <button
                  onClick={() => downloadZip(false)}
                  className="text-xs hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
                >
                  <Package className="w-3.5 h-3.5" /> ZIP
                </button>
                <button
                  onClick={() => downloadZip(true)}
                  className="text-xs hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
                >
                  <Github className="w-3.5 h-3.5" /> Git export
                </button>
                <a
                  href={`data:text/html;charset=utf-8,${encodeURIComponent(active.html)}`}
                  download={`${active.title || "nova"}.html`}
                  className="text-xs hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition"
                >
                  <Download className="w-3.5 h-3.5" /> HTML
                </a>
              </>
            )}
          </div>
        </div>

        {/* Split: chat + preview */}
        <div className="flex-1 flex min-h-0">
          {/* Chat panel */}
          <div
            className={`${
              active ? (mobileTab === "chat" ? "flex" : "hidden") : "flex"
            } md:flex w-full md:w-[380px] md:border-r border-border flex-col bg-card/20 min-h-0`}
          >
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
          <div
            className={`${
              active ? (mobileTab === "preview" ? "block" : "hidden") : "hidden"
            } md:block flex-1 overflow-hidden bg-secondary/40 p-2 md:p-4 min-w-0`}
          >
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
