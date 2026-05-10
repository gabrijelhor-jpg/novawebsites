import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Loader2, Trash2, Power, PowerOff, RefreshCw, KeyRound, LogOut, Users, FileCode2 } from "lucide-react";

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

type AdminProject = {
  id: string;
  title: string;
  prompt: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "nova:adminCreds";

function AdminPage() {
  const [creds, setCreds] = useState<{ adminUser: string; adminPass: string } | null>(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"users" | "projects">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [siteEnabled, setSiteEnabled] = useState(true);
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
      const [u, p, s] = await Promise.all([
        call("list-users", {}, c),
        call("list-projects", {}, c),
        call("settings", {}, c),
      ]);
      setUsers(u.users);
      setProjects(p.projects);
      setSiteEnabled(!!s.settings?.enabled);
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
    try {
      const data = await call("toggle-site", { enabled: !siteEnabled });
      setSiteEnabled(!!data.settings?.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Obrisati korisnika ${u.email}? Brišu se i svi njegovi projekti.`)) return;
    try {
      await call("delete-user", { userId: u.id });
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setProjects((prev) => prev.filter((x) => x.user_id !== u.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  const deleteProject = async (p: AdminProject) => {
    if (!confirm(`Obrisati projekt "${p.title}"?`)) return;
    try {
      await call("delete-project", { projectId: p.id });
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  const resetPassword = async (u: AdminUser) => {
    if (!u.email) return;
    if (!confirm(`Poslati reset lozinke na ${u.email}?`)) return;
    try {
      await call("reset-password", { email: u.email });
      alert("Reset link generiran (poslan na email).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  if (!creds) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <form
          onSubmit={login}
          className="w-full max-w-sm bg-card border border-border rounded-3xl p-8 shadow-soft"
        >
          <Link to="/" className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-accent grid place-items-center">
              <Sparkles className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-display text-2xl">Admin</span>
          </Link>
          <h1 className="text-2xl mb-1">Prijava administratora</h1>
          <p className="text-sm text-muted-foreground mb-6">Pristup samo za vlasnika.</p>

          <label className="text-xs text-muted-foreground">Korisničko ime</label>
          <input
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            className="w-full mt-1 mb-4 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent"
            autoComplete="username"
          />

          <label className="text-xs text-muted-foreground">Lozinka</label>
          <input
            type="password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            className="w-full mt-1 mb-6 px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-accent"
            autoComplete="current-password"
          />

          {loginErr && <p className="text-sm text-destructive mb-4">{loginErr}</p>}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Uđi"}
          </button>
        </form>
      </div>
    );
  }

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
          <button
            onClick={toggleSite}
            className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition ${
              siteEnabled
                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                : "border-destructive/40 text-destructive hover:bg-destructive/10"
            }`}
          >
            {siteEnabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            Stranica: {siteEnabled ? "UPALJENA" : "UGAŠENA"}
          </button>
          <button
            onClick={() => refresh()}
            className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Osvježi
          </button>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-full border border-border hover:bg-secondary flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Odjava
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-2 rounded-full text-sm flex items-center gap-1.5 ${
              tab === "users" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Korisnici ({users.length})
          </button>
          <button
            onClick={() => setTab("projects")}
            className={`px-4 py-2 rounded-full text-sm flex items-center gap-1.5 ${
              tab === "projects" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" /> Projekti ({projects.length})
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
          Napomena: lozinke korisnika su hashirane (bcrypt) i ne mogu se prikazati u plaintextu — to je sigurnosni standard.
          Možeš poslati reset lozinke na email korisnika.
        </div>

        {tab === "users" && (
          <div className="border border-border rounded-2xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Email</th>
                  <th className="text-left p-3">Provider</th>
                  <th className="text-left p-3">Registriran</th>
                  <th className="text-left p-3">Zadnja prijava</th>
                  <th className="text-left p-3">Projekti</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const count = projects.filter((p) => p.user_id === u.id).length;
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs">{u.email ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{u.provider}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleString("hr-HR")}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("hr-HR") : "nikad"}
                      </td>
                      <td className="p-3 text-xs">{count}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => resetPassword(u)}
                          title="Reset lozinke"
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          title="Obriši"
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                      Nema korisnika.
                    </td>
                  </tr>
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
                      <td className="p-3 text-xs font-mono text-muted-foreground">
                        {owner?.email ?? p.user_id.slice(0, 8)}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleString("hr-HR")}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(p.updated_at).toLocaleString("hr-HR")}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteProject(p)}
                          title="Obriši"
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {projects.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                      Nema projekata.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
