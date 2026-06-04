import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, Loader2, Check, Copy, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/pretplata")({
  component: PretplataPage,
});

type Plan = {
  slug: string; name: string; price_cents: number; points: number;
  active: boolean; sort_order: number;
};

type PendingSub = {
  id: string; plan_slug: string; status: string;
  reference_code: string | null; amount_cents: number | null; points: number | null;
  created_at: string;
};

const IBAN = "HR6423600001300206618";
const RECIPIENT = "Nova Studio";

function PretplataPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<PendingSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("subscription_plans").select("*").eq("active", true).order("sort_order"),
        user ? supabase.from("user_subscriptions").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }) as any,
      ]);
      setPlans((p as Plan[]) ?? []);
      setSubs((s as PendingSub[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const subscribe = async (plan: Plan) => {
    if (!user) return;
    setBusy(plan.slug); setError("");
    const ref = "NOVA-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data, error } = await supabase.from("user_subscriptions").insert({
      user_id: user.id, plan_slug: plan.slug, status: "pending",
      amount_cents: plan.price_cents, points: plan.points, reference_code: ref,
    } as any).select().single();
    if (error) setError(error.message);
    else setSubs((prev) => [data as PendingSub, ...prev]);
    setBusy(null);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  if (authLoading || loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const pending = subs.find((s) => s.status === "pending");
  const eur = (c: number) => (c / 100).toFixed(2) + " €";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Natrag u studio
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent grid place-items-center">
            <Sparkles className="w-3.5 h-3.5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl">Nova</span>
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-3xl md:text-4xl font-display mb-2">Pretplate i krediti</h1>
        <p className="text-muted-foreground mb-8">Mjesečna pretplata — plaćaš jednom, dobiješ pakete bodova.</p>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}

        {pending && (
          <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">Upute za plaćanje</div>
                <h2 className="text-xl font-display">Plati uplatom na IBAN</h2>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">Čeka uplatu</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Otvori svoju banku (mobilna app), unesi sljedeće podatke i pošalji uplatu. Čim primimo novac (obično istog dana),
              administrator će aktivirati pretplatu i bodovi će ti se odmah pojaviti u studiju.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Info label="Primatelj" value={RECIPIENT} onCopy={() => copy(RECIPIENT, "r")} copied={copied === "r"} />
              <Info label="IBAN" value={IBAN} onCopy={() => copy(IBAN, "i")} copied={copied === "i"} />
              <Info label="Iznos" value={eur(pending.amount_cents ?? 0)} onCopy={() => copy(((pending.amount_cents ?? 0) / 100).toFixed(2), "a")} copied={copied === "a"} />
              <Info label="Model / poziv na broj" value={`HR00 ${pending.reference_code}`} onCopy={() => copy(pending.reference_code ?? "", "p")} copied={copied === "p"} />
              <Info label="Opis plaćanja" value={`Nova pretplata ${pending.plan_slug.toUpperCase()}`} onCopy={() => copy(`Nova pretplata ${pending.plan_slug}`, "o")} copied={copied === "o"} />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Bitno: u <strong>poziv na broj</strong> obavezno upiši <strong>{pending.reference_code}</strong> kako bismo prepoznali tvoju uplatu.
            </p>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.slug} className="rounded-2xl border border-border bg-card p-6 flex flex-col">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-xl font-display">{p.name}</h3>
                <span className="text-2xl font-display">{eur(p.price_cents)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">mjesečno</p>
              <ul className="text-sm space-y-1.5 mb-6">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> {p.points.toLocaleString("hr-HR")} bodova / mj.</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Neograničeno stranica</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Hosting na /tvoje-ime</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Export HTML/CSS/JS i Git</li>
              </ul>
              <button
                disabled={!!pending || busy === p.slug}
                onClick={() => subscribe(p)}
                className="mt-auto w-full bg-primary text-primary-foreground py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {busy === p.slug ? <Loader2 className="w-4 h-4 animate-spin" /> : pending ? "Imaš pretplatu na čekanju" : "Pretplati se"}
              </button>
            </div>
          ))}
        </div>

        {subs.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-display mb-3">Povijest pretplata</h2>
            <div className="border border-border rounded-2xl overflow-hidden bg-card text-sm">
              <table className="w-full">
                <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Plan</th><th className="text-left p-3">Iznos</th><th className="text-left p-3">Referenca</th><th className="text-left p-3">Status</th><th className="text-left p-3">Datum</th></tr>
                </thead>
                <tbody>
                  {subs.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="p-3">{s.plan_slug}</td>
                      <td className="p-3">{eur(s.amount_cents ?? 0)}</td>
                      <td className="p-3 font-mono text-xs">{s.reference_code ?? "—"}</td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("hr-HR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-mono text-sm truncate">{value}</div>
      </div>
      <button onClick={onCopy} className="p-1.5 rounded hover:bg-secondary text-muted-foreground" title="Kopiraj">
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rejected: "bg-destructive/15 text-destructive",
    expired: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = { pending: "Čeka uplatu", active: "Aktivna", rejected: "Odbijena", expired: "Istekla" };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${map[status] ?? "bg-secondary"}`}>{label[status] ?? status}</span>;
}
