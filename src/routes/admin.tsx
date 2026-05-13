import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Loader2, Trash2, Power, PowerOff, RefreshCw, KeyRound, LogOut,
  Users, FileCode2, Coins, DollarSign, Settings as SettingsIcon, Check, Plus, Minus,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string;
};

type Credit = {
  user_id: string;
  points_balance: number;
  is_free: boolean;
  total_used_points: number;
  total_paid_cents: number;
};

type AdminProject = {
  id: string;
  title: string;
  prompt: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

type Settings = {
  enabled: boolean;
  cents_per_1000_points: number;
  points_per_chat: number;
  free_starting_points: number;
};

type Stats = {
  total_used_points: number;
  total_paid_cents: number;
  total_balance: number;
  free_users: number;
  user_count: number;
};

const STORAGE_KEY = "nova:adminCreds";

function AdminPage() {
  const [creds, setCreds] = useState<{ adminUser: string; adminPass: string } | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"users" | "projects" | "pricing">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setCreds(JSON.parse(raw));
    } catch {}
  }, []);

  const call = async (action: string, extra: Record<string, unknown> = {}, c = creds) => {
    if (!c) throw new Error("Nije ulogiran");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Greška");
    return data;
  };

  const refresh = async (c = creds) => {
    if (!c) return;
    setLoading(true);
    setError("");
    try {
      const [u, p, s, st] = await Promise.all([
        call("list-users", {}, c),
        call("list-projects", {}, c),
        call("settings", {}, c),
        call("stats", {}, c),
      ]);
      setUsers(u.users);
      const map: Record<string, Credit> = {};
      (u.credits as Credit[]).forEach((cr) => { map[cr.user_id] = cr; });
      setCredits(map);
      setProjects(p.projects);
      setSettings(s.settings);
      setStats(st.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (creds) refresh(creds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr("");
    setLoginLoading(true);
    try {
      const c = { adminUser: loginUser, adminPass: loginPass };
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, action: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Greška");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      setCreds(c);
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : "Greška");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCreds(null);
    setLoginUser("");
    setLoginPass("");
  };

  const toggleSite = async () => {
    if (!settings) return;
    try {
      const data = await call("toggle-site", { enabled: !settings.enabled });
      setSettings(data.settings);
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const toggleFree = async (u: AdminUser) => {
    const cur = credits[u.id];
    const next = !cur?.is_free;
    try {
      await call("toggle-free", { userId: u.id, isFree: next });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, points_balance: 0, total_used_points: 0, total_paid_cents: 0, is_free: false }), is_free: next } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const setPoints = async (u: AdminUser) => {
    const cur = credits[u.id];
    const v = prompt(`Postavi bodove za ${u.email}`, String(cur?.points_balance ?? 0));
    if (v === null) return;
    const num = Number(v);
    if (!Number.isFinite(num)) return;
    try {
      await call("set-credits", { userId: u.id, points: num });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, is_free: false, total_used_points: 0, total_paid_cents: 0, points_balance: 0 }), points_balance: Math.max(0, Math.floor(num)) } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const addPayment = async (u: AdminUser) => {
    const v = prompt(`Iznos uplate u centima za ${u.email} (npr. 100 = 1€)`, "100");
    if (!v) return;
    const cents = Number(v);
    if (!Number.isFinite(cents) || cents <= 0) return;
    try {
      const r = await call("add-payment", { userId: u.id, cents });
      alert(`Dodano ${r.added_points} bodova.`);
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Obrisati korisnika ${u.email}? Brišu se i svi njegovi projekti.`)) return;
    try {
      await call("delete-user", { userId: u.id });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setProjects((prev) => prev.filter((x) => x.user_id !== u.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const deleteProject = async (p: AdminProject) => {
    if (!confirm(`Obrisati projekt "${p.title}"?`)) return;
    try {
      await call("delete-project", { projectId: p.id });
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const resetPassword = async (u: AdminUser) => {
    if (!u.email) return;
    if (!confirm(`Poslati reset lozinke na ${u.email}?`)) return;
    try {
      await call("reset-password", { email: u.email });
      alert("Reset link generiran (poslan na email).");
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const savePricing = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const data = await call("update-pricing", {
        cents_per_1000_points: Number(fd.get("cents_per_1000_points")),
        points_per_chat: Number(fd.get("points_per_chat")),
        free_starting_points: Number(fd.get("free_starting_points")),
      });
      setSettings(data.settings);
      alert("Spremljeno.");
    } catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  if (!creds) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <form onSubmit={login} className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 shadow-soft">
          <Link to="/" className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-accent grid place-items-center">
              <Sparkles className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-display text-2xl">Admin</span>
          </Link>
          <h1 className="text-2xl mb-1">Prijava administratora</h1>
          <p className="text-sm text-muted-foreground mb-6">Pristup samo za vlasnike.</p>
          <label className="text-xs text-muted-foreground">Korisničko ime</label>
          <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} className="w-full mt-1 mb-4 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent" autoComplete="username" />
          <label className="text-xs text-muted-foreground">Lozinka</label>
          <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} className="w-full mt-1 mb-6 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent" autoComplete="current-password" />
          {loginErr && <p className="text-sm text-destructive mb-4">{loginErr}</p>}
          <button type="submit" disabled={loginLoading} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Uđi"}
          </button>
        </form>
      </div>
    );
  }

  const eur = (cents: number) => (cents / 100).toFixed(2) + "€";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent grid place-items-center">
            <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl">Admin panel</span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleSite} className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition ${settings?.enabled ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}>
            {settings?.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            {settings?.enabled ? "UPALJENA" : "UGAŠENA"}
          </button>
          <button onClick={() => refresh()} className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Osvježi
          </button>
          <button onClick={logout} className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Odjava
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<DollarSign className="w-4 h-4" />} label="Ukupno skupljeno" value={eur(stats.total_paid_cents)} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Iskorišteno bodova" value={stats.total_used_points.toLocaleString("hr-HR")} />
            <StatCard icon={<Users className="w-4 h-4" />} label="Korisnici" value={`${stats.user_count} (${stats.free_users} besplatno)`} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Preostalo bodova" value={stats.total_balance.toLocaleString("hr-HR")} />
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={<Users className="w-3.5 h-3.5" />}>Korisnici ({users.length})</TabBtn>
          <TabBtn active={tab === "projects"} onClick={() => setTab("projects")} icon={<FileCode2 className="w-3.5 h-3.5" />}>Projekti ({projects.length})</TabBtn>
          <TabBtn active={tab === "pricing"} onClick={() => setTab("pricing")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>Cijene</TabBtn>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>
        )}

        {tab === "users" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Bodovi</th>
                  <th className="text-left p-3">Iskorišteno</th>
                  <th className="text-left p-3">Uplaćeno</th>
                  <th className="text-left p-3">Pristup</th>
                  <th className="text-left p-3">Projekti</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const c = credits[u.id];
                  const count = projects.filter((p) => p.user_id === u.id).length;
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">{u.email ?? "—"}</td>
                      <td className="p-3 text-xs font-medium">{(c?.points_balance ?? 0).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-xs text-muted-foreground">{(c?.total_used_points ?? 0).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-xs text-muted-foreground">{eur(c?.total_paid_cents ?? 0)}</td>
                      <td className="p-3">
                        <button onClick={() => toggleFree(u)} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${c?.is_free ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                          {c?.is_free && <Check className="w-3 h-3" />}
                          {c?.is_free ? "Besplatno" : "Plaća"}
                        </button>
                      </td>
                      <td className="p-3 text-xs">{count}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => addPayment(u)} title="Dodaj uplatu" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => setPoints(u)} title="Postavi bodove" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Coins className="w-4 h-4" /></button>
                        <button onClick={() => resetPassword(u)} title="Reset lozinke" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => deleteUser(u)} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && !loading && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">Nema korisnika.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "projects" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Naslov</th>
                  <th className="text-left p-3">Vlasnik</th>
                  <th className="text-left p-3">Kreirano</th>
                  <th className="text-left p-3">Ažurirano</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const owner = users.find((u) => u.id === p.user_id);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3 max-w-xs truncate">{p.title}</td>
                      <td className="p-3 text-xs font-mono text-muted-foreground">{owner?.email ?? p.user_id.slice(0, 8)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => deleteProject(p)} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && !loading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">Nema projekata.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "pricing" && settings && (
          <form onSubmit={savePricing} className="max-w-md bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-display">Cijene i bodovi</h2>
            <Field label="Cijena za 1000 bodova (centi)" name="cents_per_1000_points" defaultValue={settings.cents_per_1000_points} hint="20 = 0,20€ za 1000 bodova" />
            <Field label="Bodovi po chat poruci" name="points_per_chat" defaultValue={settings.points_per_chat} hint="Koliko se bodova naplati po jednom AI odgovoru" />
            <Field label="Početni bodovi za nove korisnike" name="free_starting_points" defaultValue={settings.free_starting_points} hint="Bodovi koje novi korisnik dobije pri registraciji" />
            <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90">Spremi</button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className="text-xl font-display">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-full text-sm flex items-center gap-1.5 ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function Field({ label, name, defaultValue, hint }: { label: string; name: string; defaultValue: number; hint?: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input name={name} type="number" defaultValue={defaultValue} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent" />
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
