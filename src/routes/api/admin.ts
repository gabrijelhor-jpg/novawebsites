import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AdminRole = "owner" | "admin" | "viewer";

function hashPassword(salt: string, password: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

async function authenticate(body: any): Promise<{ username: string; role: AdminRole } | null> {
  const u = body?.adminUser;
  const p = body?.adminPass;
  if (typeof u !== "string" || typeof p !== "string") return null;
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("username, password_hash, password_salt, role")
    .eq("username", u)
    .maybeSingle();
  if (!data) return null;
  if (hashPassword(data.password_salt, p) !== data.password_hash) return null;
  return { username: data.username, role: data.role as AdminRole };
}

const WRITE_ACTIONS = new Set([
  "toggle-site", "update-pricing", "toggle-free", "set-credits", "add-payment",
  "delete-user", "delete-project", "reset-password",
  "create-admin", "update-admin-role", "delete-admin", "change-password",
  "upsert-plan", "delete-plan",
]);
const OWNER_ONLY = new Set([
  "create-admin", "update-admin-role", "delete-admin",
]);

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const auth = await authenticate(body);
        if (!auth) {
          return new Response(JSON.stringify({ error: "Neispravni admin podaci" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const action: string = body.action;
        const role = auth.role;

        if (role === "viewer" && WRITE_ACTIONS.has(action)) {
          return new Response(JSON.stringify({ error: "Nemaš dozvolu (samo pregled)." }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }
        if (OWNER_ONLY.has(action) && role !== "owner") {
          return new Response(JSON.stringify({ error: "Samo vlasnik može mijenjati administratore." }), {
            status: 403, headers: { "Content-Type": "application/json" },
          });
        }

        try {
          switch (action) {
            case "login":
              return Response.json({ ok: true, role, username: auth.username });

            case "settings": {
              const { data } = await supabaseAdmin.from("site_settings").select("*").eq("id", 1).single();
              return Response.json({ settings: data });
            }

            case "toggle-site": {
              const { data, error } = await supabaseAdmin
                .from("site_settings")
                .update({ enabled: !!body.enabled, updated_at: new Date().toISOString() })
                .eq("id", 1).select().single();
              if (error) throw error;
              return Response.json({ settings: data });
            }

            case "update-pricing": {
              const patch: any = { updated_at: new Date().toISOString() };
              const c = Number(body.cents_per_1000_points);
              const ppc = Number(body.points_per_chat);
              const st = Number(body.free_starting_points);
              if (Number.isFinite(c) && c >= 0) patch.cents_per_1000_points = Math.floor(c);
              if (Number.isFinite(ppc) && ppc > 0) patch.points_per_chat = Math.floor(ppc);
              if (Number.isFinite(st) && st >= 0) patch.free_starting_points = Math.floor(st);
              const { data, error } = await supabaseAdmin
                .from("site_settings").update(patch).eq("id", 1).select().single();
              if (error) throw error;
              return Response.json({ settings: data });
            }

            case "list-users": {
              const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
              if (error) throw error;
              const users = data.users.map((u) => ({
                id: u.id, email: u.email, created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at, provider: u.app_metadata?.provider ?? "email",
              }));
              const { data: credits } = await supabaseAdmin.from("user_credits").select("*");
              const { data: subs } = await supabaseAdmin.from("user_subscriptions").select("*");
              return Response.json({ users, credits: credits ?? [], subscriptions: subs ?? [] });
            }

            case "list-projects": {
              const { data, error } = await supabaseAdmin
                .from("generations")
                .select("id, title, prompt, user_id, created_at, updated_at")
                .order("created_at", { ascending: false }).limit(500);
              if (error) throw error;
              return Response.json({ projects: data });
            }

            case "stats": {
              const { data: credits } = await supabaseAdmin
                .from("user_credits")
                .select("total_used_points, total_paid_cents, points_balance, is_free");
              const totalUsed = (credits ?? []).reduce((s, r) => s + (r.total_used_points ?? 0), 0);
              const totalPaidCents = (credits ?? []).reduce((s, r) => s + (r.total_paid_cents ?? 0), 0);
              const totalBalance = (credits ?? []).reduce((s, r) => s + (r.points_balance ?? 0), 0);
              const freeUsers = (credits ?? []).filter((r) => r.is_free).length;
              return Response.json({
                stats: {
                  total_used_points: totalUsed, total_paid_cents: totalPaidCents,
                  total_balance: totalBalance, free_users: freeUsers,
                  user_count: (credits ?? []).length,
                },
              });
            }

            case "toggle-free": {
              const userId: string = body.userId;
              if (!userId) throw new Error("userId je obavezan");
              await supabaseAdmin.from("user_credits").upsert(
                { user_id: userId, is_free: !!body.isFree }, { onConflict: "user_id" });
              return Response.json({ ok: true });
            }

            case "set-credits": {
              const userId: string = body.userId;
              const points = Number(body.points);
              if (!userId || !Number.isFinite(points)) throw new Error("userId i points su obavezni");
              await supabaseAdmin.from("user_credits").upsert(
                { user_id: userId, points_balance: Math.max(0, Math.floor(points)) },
                { onConflict: "user_id" });
              return Response.json({ ok: true });
            }

            case "add-payment": {
              const userId: string = body.userId;
              const cents = Number(body.cents);
              if (!userId || !Number.isFinite(cents) || cents <= 0)
                throw new Error("userId i iznos (centi) su obavezni");
              const { data: settings } = await supabaseAdmin
                .from("site_settings").select("cents_per_1000_points").eq("id", 1).single();
              const rate = settings?.cents_per_1000_points ?? 20;
              const points = Math.floor((cents / rate) * 1000);
              const { data: existing } = await supabaseAdmin
                .from("user_credits").select("points_balance, total_paid_cents")
                .eq("user_id", userId).maybeSingle();
              await supabaseAdmin.from("user_credits").upsert({
                user_id: userId,
                points_balance: (existing?.points_balance ?? 0) + points,
                total_paid_cents: (existing?.total_paid_cents ?? 0) + Math.floor(cents),
              }, { onConflict: "user_id" });
              return Response.json({ ok: true, added_points: points });
            }

            case "delete-user": {
              const userId: string = body.userId;
              if (!userId) throw new Error("userId je obavezan");
              await supabaseAdmin.from("generations").delete().eq("user_id", userId);
              const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "delete-project": {
              const projectId: string = body.projectId;
              if (!projectId) throw new Error("projectId je obavezan");
              const { error } = await supabaseAdmin.from("generations").delete().eq("id", projectId);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "reset-password": {
              const email: string = body.email;
              if (!email) throw new Error("email je obavezan");
              const { error } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            // ===== Admin user management (owner only) =====
            case "list-admins": {
              const { data, error } = await supabaseAdmin
                .from("admin_users")
                .select("id, username, role, created_by, created_at")
                .order("created_at", { ascending: true });
              if (error) throw error;
              return Response.json({ admins: data, me: { username: auth.username, role } });
            }

            case "create-admin": {
              const username = String(body.username ?? "").trim().toLowerCase();
              const password = String(body.password ?? "");
              const newRole = String(body.role ?? "admin") as AdminRole;
              if (!username || username.length < 3) throw new Error("Korisničko ime mora imati barem 3 znaka");
              if (password.length < 6) throw new Error("Lozinka mora imati barem 6 znakova");
              if (!["owner", "admin", "viewer"].includes(newRole)) throw new Error("Neispravna uloga");
              const salt = randomBytes(12).toString("hex");
              const { error } = await supabaseAdmin.from("admin_users").insert({
                username, password_hash: hashPassword(salt, password),
                password_salt: salt, role: newRole, created_by: auth.username,
              });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "update-admin-role": {
              const id: string = body.id;
              const newRole = String(body.role) as AdminRole;
              if (!id || !["owner", "admin", "viewer"].includes(newRole)) throw new Error("Neispravni podaci");
              // Prevent demoting the last owner
              if (newRole !== "owner") {
                const { count } = await supabaseAdmin.from("admin_users")
                  .select("id", { count: "exact", head: true }).eq("role", "owner");
                const { data: target } = await supabaseAdmin.from("admin_users")
                  .select("role").eq("id", id).single();
                if (target?.role === "owner" && (count ?? 0) <= 1) {
                  throw new Error("Ne možeš ukloniti zadnjeg vlasnika.");
                }
              }
              const { error } = await supabaseAdmin.from("admin_users")
                .update({ role: newRole, updated_at: new Date().toISOString() }).eq("id", id);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "delete-admin": {
              const id: string = body.id;
              if (!id) throw new Error("id je obavezan");
              const { data: target } = await supabaseAdmin.from("admin_users")
                .select("username, role").eq("id", id).single();
              if (target?.username === auth.username) throw new Error("Ne možeš obrisati samog sebe.");
              if (target?.role === "owner") {
                const { count } = await supabaseAdmin.from("admin_users")
                  .select("id", { count: "exact", head: true }).eq("role", "owner");
                if ((count ?? 0) <= 1) throw new Error("Ne možeš obrisati zadnjeg vlasnika.");
              }
              const { error } = await supabaseAdmin.from("admin_users").delete().eq("id", id);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "change-password": {
              const newPass = String(body.newPassword ?? "");
              if (newPass.length < 6) throw new Error("Lozinka mora imati barem 6 znakova");
              const salt = randomBytes(12).toString("hex");
              const { error } = await supabaseAdmin.from("admin_users").update({
                password_hash: hashPassword(salt, newPass), password_salt: salt,
                updated_at: new Date().toISOString(),
              }).eq("username", auth.username);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            // ===== Subscription plan management =====
            case "list-plans": {
              const { data, error } = await supabaseAdmin
                .from("subscription_plans").select("*").order("sort_order", { ascending: true });
              if (error) throw error;
              return Response.json({ plans: data });
            }

            case "upsert-plan": {
              const slug = String(body.slug ?? "").trim().toLowerCase();
              if (!slug) throw new Error("slug je obavezan");
              const patch: any = { slug, updated_at: new Date().toISOString() };
              if (body.name !== undefined) patch.name = String(body.name);
              if (body.price_cents !== undefined) patch.price_cents = Math.max(0, Math.floor(Number(body.price_cents)));
              if (body.points !== undefined) patch.points = Math.max(0, Math.floor(Number(body.points)));
              if (body.stripe_price_id !== undefined) patch.stripe_price_id = body.stripe_price_id || null;
              if (body.active !== undefined) patch.active = !!body.active;
              if (body.sort_order !== undefined) patch.sort_order = Math.floor(Number(body.sort_order));
              const { data, error } = await supabaseAdmin.from("subscription_plans")
                .upsert(patch, { onConflict: "slug" }).select().single();
              if (error) throw error;
              return Response.json({ plan: data });
            }

            case "delete-plan": {
              const slug: string = body.slug;
              if (!slug) throw new Error("slug je obavezan");
              const { error } = await supabaseAdmin.from("subscription_plans").delete().eq("slug", slug);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            default:
              return new Response(JSON.stringify({ error: "Nepoznata akcija" }), {
                status: 400, headers: { "Content-Type": "application/json" },
              });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Greška";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
