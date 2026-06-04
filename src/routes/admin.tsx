import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Loader2, Trash2, Power, PowerOff, RefreshCw, KeyRound, LogOut,
  Users, FileCode2, Coins, DollarSign, Settings as SettingsIcon, Check, Plus,
  Shield, Package, Wallet, X, Edit3,
} from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Role = "owner" | "admin" | "viewer";
type AdminUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; provider: string };
type Credit = { user_id: string; points_balance: number; is_free: boolean; total_used_points: number; total_paid_cents: number };
type AdminProject = { id: string; title: string; prompt: string; user_id: string; created_at: string; updated_at: string };
type Settings = { enabled: boolean; cents_per_1000_points: number; points_per_chat: number; free_starting_points: number };
type Stats = { total_used_points: number; total_paid_cents: number; total_balance: number; free_users: number; user_count: number };
type AdminRow = { id: string; username: string; role: Role; created_by: string | null; created_at: string };
type Plan = { slug: string; name: string; price_cents: number; points: number; active: boolean; sort_order: number };
type Payment = { id: string; user_id: string; plan_slug: string; status: string; reference_code: string | null; amount_cents: number | null; points: number | null; created_at: string };

const STORAGE_KEY = "nova:adminCreds";

function AdminPage() {
  const [creds, setCreds] = useState<{ adminUser: string; adminPass: string } | null>(null);
  const [me, setMe] = useState<{ username: string; role: Role } | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"users" | "projects" | "pricing" | "admins" | "plans" | "payments">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) setCreds(JSON.parse(raw)); } catch {}
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

  const canEdit = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";

  const refresh = async (c = creds) => {
    if (!c) return;
    setLoading(true); setError("");
    try {
      const calls: Array<Promise<any>> = [
        call("list-users", {}, c), call("list-projects", {}, c),
        call("settings", {}, c), call("stats", {}, c),
        call("list-plans", {}, c), call("list-payments", {}, c),
      ];
      if (me?.role === "owner") calls.push(call("list-admins", {}, c));
      const results = await Promise.all(calls);
      const [u, p, s, st, pl, pay, adm] = results;
      setUsers(u.users);
      const map: Record<string, Credit> = {};
      (u.credits as Credit[]).forEach((cr) => { map[cr.user_id] = cr; });
      setCredits(map);
      setProjects(p.projects);
      setSettings(s.settings);
      setStats(st.stats);
      setPlans(pl.plans ?? []);
      setPayments(pay.payments ?? []);
      if (adm) setAdmins(adm.admins ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (creds && me) refresh(creds); /* eslint-disable-next-line */ }, [creds, me]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginErr(""); setLoginLoading(true);
    try {
      const c = { adminUser: loginUser.trim().toLowerCase(), adminPass: loginPass };
      const res = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, action: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Greška");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      setCreds(c); setMe(data.admin);
    } catch (err) { setLoginErr(err instanceof Error ? err.message : "Greška"); }
    finally { setLoginLoading(false); }
  };

  const logout = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCreds(null); setMe(null); setLoginUser(""); setLoginPass("");
  };

  const toggleSite = async () => {
    if (!settings || !canEdit) return;
    try { const d = await call("toggle-site", { enabled: !settings.enabled }); setSettings(d.settings); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const toggleFree = async (u: AdminUser) => {
    if (!canEdit) return;
    const cur = credits[u.id]; const next = !cur?.is_free;
    try {
      await call("toggle-free", { userId: u.id, isFree: next });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, points_balance: 0, total_used_points: 0, total_paid_cents: 0, is_free: false }), is_free: next } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const setPoints = async (u: AdminUser) => {
    if (!canEdit) return;
    const cur = credits[u.id];
    const v = prompt(`Postavi bodove za ${u.email}`, String(cur?.points_balance ?? 0));
    if (v === null) return; const num = Number(v); if (!Number.isFinite(num)) return;
    try {
      await call("set-credits", { userId: u.id, points: num });
      setCredits((p) => ({ ...p, [u.id]: { ...(p[u.id] ?? { user_id: u.id, is_free: false, total_used_points: 0, total_paid_cents: 0, points_balance: 0 }), points_balance: Math.max(0, Math.floor(num)) } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const addPayment = async (u: AdminUser) => {
    if (!canEdit) return;
    const v = prompt(`Iznos uplate u centima za ${u.email}`, "2000");
    if (!v) return; const cents = Number(v); if (!Number.isFinite(cents) || cents <= 0) return;
    try { const r = await call("add-payment", { userId: u.id, cents }); alert(`Dodano ${r.added_points} bodova.`); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const deleteUser = async (u: AdminUser) => {
    if (!canEdit) return;
    if (!confirm(`Obrisati korisnika ${u.email}?`)) return;
    try { await call("delete-user", { userId: u.id });
      setUsers((p) => p.filter((x) => x.id !== u.id));
      setProjects((p) => p.filter((x) => x.user_id !== u.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const deleteProject = async (p: AdminProject) => {
    if (!canEdit) return;
    if (!confirm(`Obrisati projekt "${p.title}"?`)) return;
    try { await call("delete-project", { projectId: p.id }); setProjects((prev) => prev.filter((x) => x.id !== p.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const resetPassword = async (u: AdminUser) => {
    if (!canEdit || !u.email) return;
    if (!confirm(`Reset lozinke na ${u.email}?`)) return;
    try { await call("reset-password", { email: u.email }); alert("Reset link generiran."); }
    catch (e) { setError(e instanceof Error ? e.message : "Greška"); }
  };

  const savePricing = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const d = await call("update-pricing", {
        cents_per_1000_points: Number(fd.get("cents_per_1000_points")),
        points_per_chat: Number(fd.get("points_per_chat")),
        free_starting_points: Number(fd.get("free_starting_points")),
      });
      setSettings(d.settings); alert("Spremljeno.");
    } catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  /* ---- Admins ---- */
  const createAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await call("create-admin", {
        username: fd.get("username"), password: fd.get("password"), role: fd.get("role"),
      });
      (e.currentTarget as HTMLFormElement).reset();
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  const changeAdminRole = async (a: AdminRow, role: Role) => {
    try { await call("update-admin", { id: a.id, role }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  const changeAdminPassword = async (a: AdminRow) => {
    const pw = prompt(`Nova lozinka za ${a.username}`); if (!pw) return;
    try { await call("update-admin", { id: a.id, password: pw }); alert("Lozinka promijenjena."); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  const deleteAdmin = async (a: AdminRow) => {
    if (!confirm(`Obrisati administratora ${a.username}?`)) return;
    try { await call("delete-admin", { id: a.id }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  /* ---- Plans ---- */
  const savePlan = async (plan: Plan) => {
    try { await call("upsert-plan", plan as any); setEditingPlan(null); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  const deletePlan = async (slug: string) => {
    if (!confirm(`Obrisati plan ${slug}?`)) return;
    try { await call("delete-plan", { slug }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };

  /* ---- Payments ---- */
  const approvePayment = async (p: Payment) => {
    if (!confirm(`Potvrditi uplatu ${eur(p.amount_cents ?? 0)} (ref ${p.reference_code})?`)) return;
    try { await call("approve-payment", { id: p.id }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
  };
  const rejectPayment = async (p: Payment) => {
    if (!confirm("Odbiti pretplatu?")) return;
    try { await call("reject-payment", { id: p.id }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Greška"); }
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
  const roleBadge = (r: Role) => {
    const map: Record<Role, string> = {
      owner: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
      admin: "bg-primary/20 text-primary",
      viewer: "bg-secondary text-muted-foreground",
    };
    const label = { owner: "Vlasnik", admin: "Admin", viewer: "Samo gleda" }[r];
    return <span className={`text-[11px] px-2 py-0.5 rounded-full ${map[r]}`}>{label}</span>;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent grid place-items-center">
            <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl">Admin panel</span>
          {me && (
            <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {me.username} {roleBadge(me.role)}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={toggleSite} className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition ${settings?.enabled ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10" : "border-destructive/40 text-destructive hover:bg-destructive/10"}`}>
              {settings?.enabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
              {settings?.enabled ? "UPALJENA" : "UGAŠENA"}
            </button>
          )}
          <button onClick={() => refresh()} className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Osvježi
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
          <TabBtn active={tab === "payments"} onClick={() => setTab("payments")} icon={<Wallet className="w-3.5 h-3.5" />}>
            Plaćanja {payments.filter((p) => p.status === "pending").length > 0 && <span className="ml-1 text-[10px] px-1.5 rounded-full bg-amber-500/30">{payments.filter((p) => p.status === "pending").length}</span>}
          </TabBtn>
          <TabBtn active={tab === "plans"} onClick={() => setTab("plans")} icon={<Package className="w-3.5 h-3.5" />}>Planovi</TabBtn>
          <TabBtn active={tab === "pricing"} onClick={() => setTab("pricing")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>Cijene</TabBtn>
          {isOwner && (
            <TabBtn active={tab === "admins"} onClick={() => setTab("admins")} icon={<Shield className="w-3.5 h-3.5" />}>Administratori</TabBtn>
          )}
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}
        {!canEdit && <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">Imaš samo pregled — uređivanje je onemogućeno.</div>}

        {tab === "users" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Email</th><th className="text-left p-3">Bodovi</th>
                  <th className="text-left p-3">Iskorišteno</th><th className="text-left p-3">Uplaćeno</th>
                  <th className="text-left p-3">Pristup</th><th className="text-left p-3">Projekti</th><th className="p-3" />
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
                        <button disabled={!canEdit} onClick={() => toggleFree(u)} className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 disabled:opacity-50 ${c?.is_free ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                          {c?.is_free && <Check className="w-3 h-3" />}{c?.is_free ? "Besplatno" : "Plaća"}
                        </button>
                      </td>
                      <td className="p-3 text-xs">{count}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {canEdit && <>
                          <button onClick={() => addPayment(u)} title="Dodaj uplatu" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Plus className="w-4 h-4" /></button>
                          <button onClick={() => setPoints(u)} title="Postavi bodove" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Coins className="w-4 h-4" /></button>
                          <button onClick={() => resetPassword(u)} title="Reset lozinke" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><KeyRound className="w-4 h-4" /></button>
                          <button onClick={() => deleteUser(u)} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && !loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">Nema korisnika.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "projects" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Naslov</th><th className="text-left p-3">Vlasnik</th><th className="text-left p-3">Kreirano</th><th className="text-left p-3">Ažurirano</th><th className="p-3" /></tr>
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
                        {canEdit && <button onClick={() => deleteProject(p)} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>}
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && !loading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">Nema projekata.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "payments" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr><th className="text-left p-3">Korisnik</th><th className="text-left p-3">Plan</th><th className="text-left p-3">Iznos</th><th className="text-left p-3">Referenca</th><th className="text-left p-3">Status</th><th className="text-left p-3">Datum</th><th className="p-3" /></tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const u = users.find((x) => x.id === p.user_id);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">{u?.email ?? p.user_id.slice(0, 8)}</td>
                      <td className="p-3">{p.plan_slug}</td>
                      <td className="p-3 font-medium">{eur(p.amount_cents ?? 0)}</td>
                      <td className="p-3 font-mono text-xs">{p.reference_code ?? "—"}</td>
                      <td className="p-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : p.status === "pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-destructive/15 text-destructive"}`}>{p.status}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {canEdit && p.status === "pending" && <>
                          <button onClick={() => approvePayment(p)} className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 mr-1">Potvrdi</button>
                          <button onClick={() => rejectPayment(p)} className="text-xs px-2 py-1 rounded bg-destructive/15 text-destructive hover:bg-destructive/25">Odbij</button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
                {payments.length === 0 && !loading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">Nema uplata.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "plans" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              {plans.map((p) => (
                <div key={p.slug} className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display text-lg">{p.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.active ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-secondary text-muted-foreground"}`}>{p.active ? "Aktivan" : "Neaktivan"}</span>
                  </div>
                  <div className="text-2xl font-display mb-1">{eur(p.price_cents)}<span className="text-sm text-muted-foreground"> / mj.</span></div>
                  <div className="text-sm text-muted-foreground mb-4">{p.points.toLocaleString("hr-HR")} bodova</div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <button onClick={() => setEditingPlan(p)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-secondary flex items-center gap-1"><Edit3 className="w-3 h-3" /> Uredi</button>
                      <button onClick={() => deletePlan(p.slug)} className="text-xs px-3 py-1.5 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              ))}
              {canEdit && (
                <button onClick={() => setEditingPlan({ slug: "", name: "", price_cents: 2000, points: 10000, active: true, sort_order: plans.length })}
                  className="border-2 border-dashed border-border rounded-2xl p-5 text-muted-foreground hover:bg-secondary/30 flex flex-col items-center justify-center min-h-[180px]">
                  <Plus className="w-6 h-6 mb-2" /> Dodaj plan
                </button>
              )}
            </div>

            {editingPlan && (
              <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-50" onClick={() => setEditingPlan(null)}>
                <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); savePlan(editingPlan); }} className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display text-lg">{plans.find((p) => p.slug === editingPlan.slug) ? "Uredi plan" : "Novi plan"}</h3>
                    <button type="button" onClick={() => setEditingPlan(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
                  </div>
                  <Field2 label="Slug (npr. basic)" value={editingPlan.slug} onChange={(v) => setEditingPlan({ ...editingPlan, slug: v })} disabled={!!plans.find((p) => p.slug === editingPlan.slug)} />
                  <Field2 label="Naziv" value={editingPlan.name} onChange={(v) => setEditingPlan({ ...editingPlan, name: v })} />
                  <Field2 label="Cijena (centi)" value={String(editingPlan.price_cents)} onChange={(v) => setEditingPlan({ ...editingPlan, price_cents: Number(v) || 0 })} hint={`${(Number(editingPlan.price_cents) / 100).toFixed(2)} €`} />
                  <Field2 label="Bodovi" value={String(editingPlan.points)} onChange={(v) => setEditingPlan({ ...editingPlan, points: Number(v) || 0 })} />
                  <Field2 label="Redoslijed" value={String(editingPlan.sort_order)} onChange={(v) => setEditingPlan({ ...editingPlan, sort_order: Number(v) || 0 })} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editingPlan.active} onChange={(e) => setEditingPlan({ ...editingPlan, active: e.target.checked })} /> Aktivan
                  </label>
                  <button type="submit" className="w-full bg-primary text-primary-foreground py-2 rounded-lg">Spremi</button>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === "pricing" && settings && (
          <form onSubmit={savePricing} className="max-w-md bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-display">Cijene i bodovi (po chatu)</h2>
            <Field label="Cijena za 1000 bodova (centi)" name="cents_per_1000_points" defaultValue={settings.cents_per_1000_points} hint="20 = 0,20€ za 1000 bodova" />
            <Field label="Bodovi po chat poruci" name="points_per_chat" defaultValue={settings.points_per_chat} hint="Koliko se bodova naplati po jednom AI odgovoru" />
            <Field label="Početni bodovi za nove korisnike" name="free_starting_points" defaultValue={settings.free_starting_points} />
            <button type="submit" disabled={!canEdit} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50">Spremi</button>
          </form>
        )}

        {tab === "admins" && isOwner && (
          <div className="space-y-6">
            <div className="border border-border rounded-2xl overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Korisničko ime</th><th className="text-left p-3">Uloga</th><th className="text-left p-3">Kreirao</th><th className="text-left p-3">Datum</th><th className="p-3" /></tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-3 font-mono">{a.username}</td>
                      <td className="p-3">
                        {a.role === "owner" ? roleBadge("owner") : (
                          <select value={a.role} onChange={(e) => changeAdminRole(a, e.target.value as Role)} className="text-xs bg-background border border-border rounded px-2 py-1">
                            <option value="viewer">Samo gleda</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{a.created_by ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("hr-HR")}</td>
                      <td className="p-3 text-right">
                        {a.role !== "owner" && <>
                          <button onClick={() => changeAdminPassword(a)} title="Promijeni lozinku" className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><KeyRound className="w-4 h-4" /></button>
                          <button onClick={() => deleteAdmin(a)} title="Obriši" className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={createAdmin} className="bg-card border border-border rounded-2xl p-6 max-w-md space-y-3">
              <h3 className="font-display">Dodaj administratora</h3>
              <input name="username" placeholder="korisničko ime" required className="w-full px-3 py-2 rounded-lg bg-background border border-border" />
              <input name="password" type="password" placeholder="lozinka (min 6)" required className="w-full px-3 py-2 rounded-lg bg-background border border-border" />
              <select name="role" defaultValue="viewer" className="w-full px-3 py-2 rounded-lg bg-background border border-border">
                <option value="viewer">Samo gleda</option>
                <option value="admin">Admin (može mijenjati)</option>
              </select>
              <button type="submit" className="w-full bg-primary text-primary-foreground py-2 rounded-lg">Dodaj</button>
            </form>
          </div>
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

function Field2({ label, value, onChange, hint, disabled }: { label: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full mt-1 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent disabled:opacity-60" />
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
