import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Role = "owner" | "admin" | "viewer";

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 12) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authenticate(body: any): Promise<
  | { ok: true; admin: { id: string; username: string; role: Role } }
  | { ok: false; error: string }
> {
  const username = body?.adminUser;
  const password = body?.adminPass;
  if (typeof username !== "string" || typeof password !== "string") {
    return { ok: false, error: "Neispravni admin podaci" };
  }
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("id, username, role, password_hash, password_salt")
    .eq("username", username)
    .maybeSingle();
  if (!data) return { ok: false, error: "Neispravno korisničko ime ili lozinka" };
  const hash = await sha256Hex(password + ":" + data.password_salt);
  if (hash !== data.password_hash) return { ok: false, error: "Neispravno korisničko ime ili lozinka" };
  return { ok: true, admin: { id: data.id, username: data.username, role: data.role as Role } };
}

const canEdit = (r: Role) => r === "owner" || r === "admin";
const canManageAdmins = (r: Role) => r === "owner";

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const auth = await authenticate(body);
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { admin } = auth;
        const action: string = body.action;

        const requireEdit = () => {
          if (!canEdit(admin.role)) throw new Error("Nemaš ovlasti za ovu akciju.");
        };
        const requireOwner = () => {
          if (!canManageAdmins(admin.role)) throw new Error("Samo vlasnik može mijenjati administratore.");
        };

        try {
          switch (action) {
            case "login":
              return Response.json({ ok: true, admin });

            case "settings": {
              const { data } = await supabaseAdmin.from("site_settings").select("*").eq("id", 1).single();
              return Response.json({ settings: data });
            }

            case "toggle-site": {
              requireEdit();
              const enabled = !!body.enabled;
              const { data, error } = await supabaseAdmin
                .from("site_settings")
                .update({ enabled, updated_at: new Date().toISOString() })
                .eq("id", 1).select().single();
              if (error) throw error;
              return Response.json({ settings: data });
            }

            case "update-pricing": {
              requireEdit();
              const cents = Number(body.cents_per_1000_points);
              const ppc = Number(body.points_per_chat);
              const start = Number(body.free_starting_points);
              const patch: Record<string, any> = { updated_at: new Date().toISOString() };
              if (Number.isFinite(cents) && cents >= 0) patch.cents_per_1000_points = Math.floor(cents);
              if (Number.isFinite(ppc) && ppc > 0) patch.points_per_chat = Math.floor(ppc);
              if (Number.isFinite(start) && start >= 0) patch.free_starting_points = Math.floor(start);
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
              return Response.json({ users, credits: credits ?? [] });
            }

            case "list-projects": {
              const { data, error } = await supabaseAdmin
                .from("generations").select("id, title, prompt, user_id, created_at, updated_at")
                .order("created_at", { ascending: false }).limit(500);
              if (error) throw error;
              return Response.json({ projects: data });
            }

            case "stats": {
              const { data: credits } = await supabaseAdmin
                .from("user_credits").select("total_used_points, total_paid_cents, points_balance, is_free");
              const totalUsed = (credits ?? []).reduce((s, r) => s + (r.total_used_points ?? 0), 0);
              const totalPaidCents = (credits ?? []).reduce((s, r) => s + (r.total_paid_cents ?? 0), 0);
              const totalBalance = (credits ?? []).reduce((s, r) => s + (r.points_balance ?? 0), 0);
              const freeUsers = (credits ?? []).filter((r) => r.is_free).length;
              return Response.json({
                stats: {
                  total_used_points: totalUsed, total_paid_cents: totalPaidCents,
                  total_balance: totalBalance, free_users: freeUsers, user_count: (credits ?? []).length,
                },
              });
            }

            case "toggle-free": {
              requireEdit();
              const userId: string = body.userId;
              const isFree = !!body.isFree;
              if (!userId) throw new Error("userId je obavezan");
              await supabaseAdmin.from("user_credits")
                .upsert({ user_id: userId, is_free: isFree }, { onConflict: "user_id" });
              return Response.json({ ok: true });
            }

            case "set-credits": {
              requireEdit();
              const userId: string = body.userId;
              const points = Number(body.points);
              if (!userId || !Number.isFinite(points)) throw new Error("userId i points su obavezni");
              await supabaseAdmin.from("user_credits").upsert(
                { user_id: userId, points_balance: Math.max(0, Math.floor(points)) },
                { onConflict: "user_id" }
              );
              return Response.json({ ok: true });
            }

            case "add-payment": {
              requireEdit();
              const userId: string = body.userId;
              const cents = Number(body.cents);
              if (!userId || !Number.isFinite(cents) || cents <= 0) throw new Error("userId i iznos (centi) su obavezni");
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
              requireEdit();
              const userId: string = body.userId;
              if (!userId) throw new Error("userId je obavezan");
              await supabaseAdmin.from("generations").delete().eq("user_id", userId);
              const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "delete-project": {
              requireEdit();
              const projectId: string = body.projectId;
              if (!projectId) throw new Error("projectId je obavezan");
              const { error } = await supabaseAdmin.from("generations").delete().eq("id", projectId);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "reset-password": {
              requireEdit();
              const email: string = body.email;
              if (!email) throw new Error("email je obavezan");
              const { error } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            /* ===== Administrators ===== */
            case "list-admins": {
              requireOwner();
              const { data, error } = await supabaseAdmin
                .from("admin_users")
                .select("id, username, role, created_by, created_at, updated_at")
                .order("created_at");
              if (error) throw error;
              return Response.json({ admins: data });
            }

            case "create-admin": {
              requireOwner();
              const username = String(body.username ?? "").trim().toLowerCase();
              const password = String(body.password ?? "");
              const role = (body.role as Role) ?? "viewer";
              if (!/^[a-z0-9_.-]{3,32}$/.test(username)) throw new Error("Neispravno korisničko ime.");
              if (password.length < 6) throw new Error("Lozinka mora imati barem 6 znakova.");
              if (!["admin", "viewer"].includes(role)) throw new Error("Neispravna uloga.");
              const salt = randomHex(12);
              const hash = await sha256Hex(password + ":" + salt);
              const { error } = await supabaseAdmin.from("admin_users").insert({
                username, role, password_hash: hash, password_salt: salt, created_by: admin.username,
              });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "update-admin": {
              requireOwner();
              const id: string = body.id;
              if (!id) throw new Error("id je obavezan");
              const patch: Record<string, any> = { updated_at: new Date().toISOString() };
              if (body.role && ["admin", "viewer"].includes(body.role)) patch.role = body.role;
              if (body.password) {
                if (String(body.password).length < 6) throw new Error("Lozinka mora imati barem 6 znakova.");
                const salt = randomHex(12);
                patch.password_salt = salt;
                patch.password_hash = await sha256Hex(String(body.password) + ":" + salt);
              }
              // Prevent demoting/changing owner
              const { data: target } = await supabaseAdmin.from("admin_users").select("role").eq("id", id).single();
              if (target?.role === "owner") throw new Error("Vlasnika nije moguće mijenjati.");
              const { error } = await supabaseAdmin.from("admin_users").update(patch).eq("id", id);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "delete-admin": {
              requireOwner();
              const id: string = body.id;
              const { data: target } = await supabaseAdmin.from("admin_users").select("role").eq("id", id).single();
              if (target?.role === "owner") throw new Error("Vlasnika nije moguće obrisati.");
              const { error } = await supabaseAdmin.from("admin_users").delete().eq("id", id);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            /* ===== Subscription plans ===== */
            case "list-plans": {
              const { data, error } = await supabaseAdmin
                .from("subscription_plans").select("*").order("sort_order");
              if (error) throw error;
              return Response.json({ plans: data });
            }

            case "upsert-plan": {
              requireEdit();
              const slug = String(body.slug ?? "").trim().toLowerCase();
              if (!/^[a-z0-9_-]{2,32}$/.test(slug)) throw new Error("Neispravan slug.");
              const row = {
                slug,
                name: String(body.name ?? slug),
                price_cents: Math.max(0, Math.floor(Number(body.price_cents ?? 0))),
                points: Math.max(0, Math.floor(Number(body.points ?? 0))),
                active: body.active !== false,
                sort_order: Math.floor(Number(body.sort_order ?? 0)),
                updated_at: new Date().toISOString(),
              };
              const { error } = await supabaseAdmin
                .from("subscription_plans").upsert(row, { onConflict: "slug" });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "delete-plan": {
              requireEdit();
              const slug: string = body.slug;
              const { error } = await supabaseAdmin.from("subscription_plans").delete().eq("slug", slug);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            /* ===== Payments / subscriptions ===== */
            case "list-payments": {
              const { data, error } = await supabaseAdmin
                .from("user_subscriptions").select("*")
                .order("created_at", { ascending: false }).limit(500);
              if (error) throw error;
              return Response.json({ payments: data });
            }

            case "approve-payment": {
              requireEdit();
              const id: string = body.id;
              const { data: sub, error: e1 } = await supabaseAdmin
                .from("user_subscriptions").select("*").eq("id", id).single();
              if (e1 || !sub) throw e1 ?? new Error("Pretplata nije pronađena.");
              const periodEnd = new Date(); periodEnd.setDate(periodEnd.getDate() + 30);
              const { error: e2 } = await supabaseAdmin.from("user_subscriptions").update({
                status: "active", approved_at: new Date().toISOString(),
                current_period_end: periodEnd.toISOString(),
              }).eq("id", id);
              if (e2) throw e2;
              const { data: existing } = await supabaseAdmin
                .from("user_credits").select("points_balance, total_paid_cents")
                .eq("user_id", sub.user_id).maybeSingle();
              await supabaseAdmin.from("user_credits").upsert({
                user_id: sub.user_id,
                points_balance: (existing?.points_balance ?? 0) + (sub.points ?? 0),
                total_paid_cents: (existing?.total_paid_cents ?? 0) + (sub.amount_cents ?? 0),
              }, { onConflict: "user_id" });
              return Response.json({ ok: true });
            }

            case "reject-payment": {
              requireEdit();
              const id: string = body.id;
              const { error } = await supabaseAdmin
                .from("user_subscriptions").update({ status: "rejected" }).eq("id", id);
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
