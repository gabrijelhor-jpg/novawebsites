import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Loader2, Trash2, Power, PowerOff, RefreshCw, KeyRound, LogOut,
  Users, FileCode2, Coins, DollarSign, Settings as SettingsIcon, Check, Plus,
  Shield, CreditCard, Crown, Eye, UserCog,
} from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type AdminRole = "owner" | "admin" | "viewer";
type AdminUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; provider: string };
type Credit = { user_id: string; points_balance: number; is_free: boolean; total_used_points: number; total_paid_cents: number };
type UserSub = { user_id: string; plan_slug: string; status: string; current_period_end: string | null };
type AdminProject = { id: string; title: string; prompt: string; user_id: string; created_at: string; updated_at: string };
type Settings = { enabled: boolean; cents_per_1000_points: number; points_per_chat: number; free_starting_points: number };
type Stats = { total_used_points: number; total_paid_cents: number; total_balance: number; free_users: number; user_count: number };
type AdminRow = { id: string; username: string; role: AdminRole; created_by: string | null; created_at: string };
type Plan = { slug: string; name: string; price_cents: number; points: number; stripe_price_id: string | null; active: boolean; sort_order: number };

const STORAGE_KEY = "nova:adminCreds";
type Creds = { adminUser: string; adminPass: string };
type Me = { username: string; role: AdminRole };

function AdminPage() {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"users" | "projects" | "pricing" | "plans" | "admins">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [subs, setSubs] = useState<Record<string, UserSub>>({});
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isViewer = me?.role === "viewer";
  const isOwner = me?.role === "owner";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setCreds(JSON.parse(raw));
    } catch {}
  }, []);

  const call = async (action: string, extra: Record<string, unknown> = {}, c = creds) => {
    if (!c) throw new Error("Nije ulogiran");
    const res = await fetch("/api/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Greška");
    return data;
  };

  const refresh = async (c = creds) => {
    if (!c) return;
    setLoading(true); setError("");
    try {
      const [u, p, s, st, ad, pl] = await Promise.all([
        call("list-users", {}, c), call("list-projects", {}, c),
        call("settings", {}, c), call("stats", {}, c),
        call("list-admins", {}, c), call("list-plans", {}, c),
      ]);
      setUsers(u.users);
      const cm: Record<string, Credit> = {};
      (u.credits as Credit[]).forEach((cr) => { cm[cr.user_id] = cr; });
      setCredits(cm);
      const sm: Record<string, UserSub> = {};
      ((u.subscriptions ?? []) as UserSub[]).forEach((s) => { if (s.status === "active") sm[s.user_id] = s; });
      setSubs(sm);
      setProjects(p.projects); setSettings(s.settings); setStats(st.stats);
      setAdmins(ad.admins); setMe(ad.me);
      setPlans(pl.plans);
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (creds) refresh(creds); /* eslint-disable-next-line */ }, [creds]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(""); setLoginLoading(true);
    try {
      const c = { adminUser: loginUser.trim().toLowerCase(), adminPass: loginPass };
      const res = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, action: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Greška");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      setCreds(c);
      setMe({ username: data.username, role: data.role });
    } catch (err) { setLoginErr(err instanceof Error ? err.message : "Greška"); }
    finally { setLoginLoading(false); }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCreds(null); setMe(null); setLoginUser(""); setLoginPass("");
  };

  const guard = (fn: () => void | Promise<void>) => () => {
    if (isViewer) { setError("Samo pregled — nemaš dozvolu za izmjene."); return; }
    fn();
  };

  const toggleSite = guard(async () => {
    if (!settings) return;
    try { const d = await call("toggle-site", { enabled: !settings.enabled }); setSettings(d.settings); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  });

  const toggleFree = (u: AdminUser) => guard(async () => {
    const next = !credits[u.id]?.is_free;
    try {
      await call("toggle-free", { userId: u.id, isFree: next });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, points_balance: 0, total_used_points: 0, total_paid_cents: 0, is_free: false }), is_free: next } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const setPoints = (u: AdminUser) => guard(async () => {
    const v = prompt(`Postavi bodove za ${u.email}`, String(credits[u.id]?.points_balance ?? 0));
    if (v === null) return;
    const n = Number(v); if (!Number.isFinite(n)) return;
    try {
      await call("set-credits", { userId: u.id, points: n });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, is_free: false, total_used_points: 0, total_paid_cents: 0, points_balance: 0 }), points_balance: Math.max(0, Math.floor(n)) } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const addPayment = (u: AdminUser) => guard(async () => {
    const v = prompt(`Iznos uplate u centima za ${u.email} (npr. 100 = 1€)`, "100");
    if (!v) return;
    const c = Number(v); if (!Number.isFinite(c) || c <= 0) return;
    try { const r = await call("add-payment", { userId: u.id, cents: c }); alert(`Dodano ${r.added_points} bodova.`); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const deleteUser = (u: AdminUser) => guard(async () => {
    if (!confirm(`Obrisati ${u.email}? Brišu se i svi projekti.`)) return;
    try { await call("delete-user", { userId: u.id });
      setUsers((p) => p.filter((x) => x.id !== u.id));
      setProjects((p) => p.filter((x) => x.user_id !== u.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const deleteProject = (p: AdminProject) => guard(async () => {
    if (!confirm(`Obrisati "${p.title}"?`)) return;
    try { await call("delete-project", { projectId: p.id }); setProjects((x) => x.filter((y) => y.id !== p.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const resetPassword = (u: AdminUser) => guard(async () => {
    if (!u.email) return;
    if (!confirm(`Reset lozinke za ${u.email}?`)) return;
    try { await call("reset-password", { email: u.email }); alert("Reset link generiran."); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const savePricing = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isViewer) return;
    const fd = new FormData(e.currentTarget);
    (async () => {
      try {
        const d = await call("update-pricing", {
          cents_per_1000_points: Number(fd.get("cents_per_1000_points")),
          points_per_chat: Number(fd.get("points_per_chat")),
          free_starting_points: Number(fd.get("free_starting_points")),
        });
        setSettings(d.settings); alert("Spremljeno.");
      } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    })();
  };

  const savePlan = (plan: Plan) => guard(async () => {
    try { await call("upsert-plan", plan); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  })();

  const createAdmin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isOwner) return;
    const fd = new FormData(e.currentTarget);
    (async () => {
      try {
        await call("create-admin", {
          username: fd.get("username"), password: fd.get("password"), role: fd.get("role"),
        });
        (e.target as HTMLFormElement).reset();
        refresh();
      } catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
    })();
  };

  const setAdminRole = (a: AdminRow, role: AdminRole) => {
    if (!isOwner) return;
    (async () => {
      try { await call("update-admin-role", { id: a.id, role }); refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    })();
  };

  const deleteAdmin = (a: AdminRow) => {
    if (!isOwner) return;
    if (!confirm(`Obrisati admina ${a.username}?`)) return;
    (async () => {
      try { await call("delete-admin", { id: a.id }); refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    })();
  };

  const changeMyPassword = () => {
    const np = prompt("Nova lozinka (min 6 znakova):");
    if (!np) return;
    (async () => {
      try { await call("change-password", { newPassword: np }); alert("Lozinka promijenjena."); }
      catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    })();
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
          <p className="text-sm text-muted-foreground mb-6">Pristup samo za odobrene korisnike.</p>
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
  const roleIcon = (r: AdminRole) => r === "owner" ? <Crown className="w-3 h-3" /> : r === "admin" ? <Shield className="w-3 h-3" /> : <Eye className="w-3 h-3" />;
  const roleColor = (r: AdminRole) => r === "owner" ? "text-accent border-accent/40 bg-accent/10" : r === "admin" ? "text-primary border-primary/40 bg-primary/10" : "border-border text-muted-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent grid place-items-center">
            <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl">Admin panel</span>
          {me && (
            <span className={`ml-2 text-[10px] uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${roleColor(me.role)}`}>
              {roleIcon(me.role)} {me.username} · {me.role}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleSite} disabled={isViewer} className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition disabled:opacity-40 ${settings?.enabled ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}>
            {settings?.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            {settings?.enabled ? "UPALJENA" : "UGAŠENA"}
          </button>
          <button onClick={() => refresh()} className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Osvježi
          </button>
          <button onClick={changeMyPassword} title="Promijeni moju lozinku" className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button onClick={logout} className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <LogOut className="w-3.5 h-3.5" /> Odjava
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<DollarSign className="w-4 h-4" />} label="Ukupno skupljeno" value={eur(stats.total_paid_cents)} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Iskorišteno bodova" value={stats.total_used_points.toLocaleString("hr-HR")} />
            <StatCard icon={<Users className="w-4 h-4" />} label="Korisnici" value={`${stats.user_count} (${stats.free_users} besplatno)`} />
            <StatCard icon={<Coins className="w-4 h-4" />} label="Preostalo bodova" value={stats.total_balance.toLocaleString("hr-HR")} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={<Users className="w-3.5 h-3.5" />}>Korisnici ({users.length})</TabBtn>
          <TabBtn active={tab === "projects"} onClick={() => setTab("projects")} icon={<FileCode2 className="w-3.5 h-3.5" />}>Projekti ({projects.length})</TabBtn>
          <TabBtn active={tab === "plans"} onClick={() => setTab("plans")} icon={<CreditCard className="w-3.5 h-3.5" />}>Pretplate</TabBtn>
          <TabBtn active={tab === "pricing"} onClick={() => setTab("pricing")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>Cijene bodova</TabBtn>
          {isOwner && <TabBtn active={tab === "admins"} onClick={() => setTab("admins")} icon={<UserCog className="w-3.5 h-3.5" />}>Administratori ({admins.length})</TabBtn>}
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}
        {isViewer && <div className="mb-4 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-sm text-accent">Pregled-only način — izmjene su onemogućene.</div>}

        {tab === "users" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Bodovi</th>
                  <th className="text-left p-3">Plan</th>
                  <th className="text-left p-3">Iskorišteno</th>
                  <th className="text-left p-3">Uplaćeno</th>
                  <th className="text-left p-3">Pristup</th>
                  <th className="text-left p-3">Proj.</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const c = credits[u.id]; const sub = subs[u.id];
                  const count = projects.filter((p) => p.user_id === u.id).length;
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">{u.email ?? "—"}</td>
                      <td className="p-3 text-xs font-medium">{(c?.points_balance ?? 0).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-xs">{sub ? <span className="px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary uppercase">{sub.plan_slug}</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3 text-xs text-muted-foreground">{(c?.total_used_points ?? 0).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-xs text-muted-foreground">{eur(c?.total_paid_cents ?? 0)}</td>
                      <td className="p-3">
                        <button onClick={() => toggleFree(u)} disabled={isViewer} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 disabled:opacity-40 ${c?.is_free ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                          {c?.is_free && <Check className="w-3 h-3" />}
                          {c?.is_free ? "Besplatno" : "Plaća"}
                        </button>
                      </td>
                      <td className="p-3 text-xs">{count}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => addPayment(u)} disabled={isViewer} title="Dodaj uplatu" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => setPoints(u)} disabled={isViewer} title="Postavi bodove" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"><Coins className="w-4 h-4" /></button>
                        <button onClick={() => resetPassword(u)} disabled={isViewer} title="Reset lozinke" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => deleteUser(u)} disabled={isViewer} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && !loading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">Nema korisnika.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "projects" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left p-3">Naslov</th><th className="text-left p-3">Vlasnik</th>
                <th className="text-left p-3">Kreirano</th><th className="text-left p-3">Ažurirano</th><th className="p-3" />
              </tr></thead>
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
                        <button onClick={() => deleteProject(p)} disabled={isViewer} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && !loading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">Nema projekata.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "pricing" && settings && (
          <form onSubmit={savePricing} className="max-w-md bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-display">Cijene i bodovi</h2>
            <Field label="Cijena za 1000 bodova (centi)" name="cents_per_1000_points" defaultValue={settings.cents_per_1000_points} hint="20 = 0,20€ za 1000 bodova" />
            <Field label="Bodovi po chat poruci" name="points_per_chat" defaultValue={settings.points_per_chat} hint="Koliko bodova jedna AI poruka troši" />
            <Field label="Početni bodovi za nove korisnike" name="free_starting_points" defaultValue={settings.free_starting_points} hint="Bodovi pri registraciji" />
            <button type="submit" disabled={isViewer} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">Spremi</button>
          </form>
        )}

        {tab === "plans" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Mjesečne pretplate. Promijeni cijenu ili broj bodova i klikni <b>Spremi</b>. <span className="text-accent">Bodovi se dodaju korisniku svaki mjesec automatski preko Stripe webhooka.</span></p>
            <div className="grid md:grid-cols-3 gap-4">
              {plans.map((p) => <PlanCard key={p.slug} plan={p} disabled={isViewer} onSave={savePlan} />)}
            </div>
          </div>
        )}

        {tab === "admins" && isOwner && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground"><tr>
                  <th className="text-left p-3">Korisnik</th><th className="text-left p-3">Uloga</th><th className="p-3" />
                </tr></thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-3 font-mono text-xs">{a.username}{a.username === me?.username && <span className="ml-2 text-[10px] text-accent">(ti)</span>}</td>
                      <td className="p-3">
                        <select value={a.role} onChange={(e) => setAdminRole(a, e.target.value as AdminRole)} className="bg-background border border-border rounded px-2 py-1 text-xs">
                          <option value="owner">owner</option><option value="admin">admin</option><option value="viewer">viewer</option>
                        </select>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => deleteAdmin(a)} disabled={a.username === me?.username} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={createAdmin} className="bg-card border border-border rounded-2xl p-6 space-y-3 h-fit">
              <h3 className="font-display text-lg">Dodaj administratora</h3>
              <div>
                <label className="text-xs text-muted-foreground">Korisničko ime</label>
                <input name="username" required minLength={3} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Lozinka (min 6)</label>
                <input name="password" type="password" required minLength={6} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Uloga</label>
                <select name="role" defaultValue="admin" className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent text-sm">
                  <option value="owner">owner — sve može + upravlja adminima</option>
                  <option value="admin">admin — sve može osim admina</option>
                  <option value="viewer">viewer — samo pregled</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:opacity-90 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Dodaj</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, disabled, onSave }: { plan: Plan; disabled: boolean; onSave: (p: Plan) => void }) {
  const [draft, setDraft] = useState(plan);
  useEffect(() => setDraft(plan), [plan]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="bg-transparent text-xl font-display border-b border-transparent focus:border-accent outline-none flex-1" />
        <span className="text-[10px] uppercase text-muted-foreground">{plan.slug}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="block">
          <span className="text-muted-foreground">Cijena (€/mj)</span>
          <input type="number" step="0.01" value={(draft.price_cents / 100).toFixed(2)}
            onChange={(e) => setDraft({ ...draft, price_cents: Math.round(Number(e.target.value) * 100) })}
            className="w-full mt-1 px-2 py-1.5 rounded bg-background border border-border text-sm" />
        </label>
        <label className="block">
          <span className="text-muted-foreground">Bodovi / mj</span>
          <input type="number" value={draft.points} onChange={(e) => setDraft({ ...draft, points: Number(e.target.value) })}
            className="w-full mt-1 px-2 py-1.5 rounded bg-background border border-border text-sm" />
        </label>
      </div>
      <label className="block text-xs">
        <span className="text-muted-foreground">Stripe Price ID</span>
        <input value={draft.stripe_price_id ?? ""} onChange={(e) => setDraft({ ...draft, stripe_price_id: e.target.value })}
          placeholder="price_…" className="w-full mt-1 px-2 py-1.5 rounded bg-background border border-border text-xs font-mono" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
        <span>Aktivan</span>
      </label>
      <button onClick={() => onSave(draft)} disabled={disabled || !dirty}
        className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm hover:opacity-90 disabled:opacity-30">
        {dirty ? "Spremi promjene" : "Spremljeno"}
      </button>
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
