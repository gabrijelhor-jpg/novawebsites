import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMINS: Record<string, string> = {
  gabrijelhor: "Bmwcir8cl",
  davidknez: "davidknez",
};

function checkAuth(body: any) {
  const u = body?.adminUser;
  const p = body?.adminPass;
  return typeof u === "string" && typeof p === "string" && ADMINS[u] === p;
}

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        if (!checkAuth(body)) {
          return new Response(JSON.stringify({ error: "Neispravni admin podaci" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const action: string = body.action;

        try {
          switch (action) {
            case "login":
              return Response.json({ ok: true });

            case "settings": {
              const { data } = await supabaseAdmin
                .from("site_settings")
                .select("*")
                .eq("id", 1)
                .single();
              return Response.json({ settings: data });
            }

            case "toggle-site": {
              const enabled = !!body.enabled;
              const { data, error } = await supabaseAdmin
                .from("site_settings")
                .update({ enabled, updated_at: new Date().toISOString() })
                .eq("id", 1)
                .select()
                .single();
              if (error) throw error;
              return Response.json({ settings: data });
            }

            case "update-pricing": {
              const cents = Number(body.cents_per_1000_points);
              const ppc = Number(body.points_per_chat);
              const start = Number(body.free_starting_points);
              const patch: Record<string, number | string> = { updated_at: new Date().toISOString() };
              if (Number.isFinite(cents) && cents >= 0) patch.cents_per_1000_points = Math.floor(cents);
              if (Number.isFinite(ppc) && ppc > 0) patch.points_per_chat = Math.floor(ppc);
              if (Number.isFinite(start) && start >= 0) patch.free_starting_points = Math.floor(start);
              const { data, error } = await supabaseAdmin
                .from("site_settings")
                .update(patch)
                .eq("id", 1)
                .select()
                .single();
              if (error) throw error;
              return Response.json({ settings: data });
            }

            case "list-users": {
              const { data, error } = await supabaseAdmin.auth.admin.listUsers({
                page: 1,
                perPage: 200,
              });
              if (error) throw error;
              const users = data.users.map((u) => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at,
                provider: u.app_metadata?.provider ?? "email",
              }));
              const { data: credits } = await supabaseAdmin.from("user_credits").select("*");
              return Response.json({ users, credits: credits ?? [] });
            }

            case "list-projects": {
              const { data, error } = await supabaseAdmin
                .from("generations")
                .select("id, title, prompt, user_id, created_at, updated_at")
                .order("created_at", { ascending: false })
                .limit(500);
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
                  total_used_points: totalUsed,
                  total_paid_cents: totalPaidCents,
                  total_balance: totalBalance,
                  free_users: freeUsers,
                  user_count: (credits ?? []).length,
                },
              });
            }

            case "toggle-free": {
              const userId: string = body.userId;
              const isFree = !!body.isFree;
              if (!userId) throw new Error("userId je obavezan");
              await supabaseAdmin
                .from("user_credits")
                .upsert({ user_id: userId, is_free: isFree }, { onConflict: "user_id" });
              return Response.json({ ok: true });
            }

            case "set-credits": {
              const userId: string = body.userId;
              const points = Number(body.points);
              if (!userId || !Number.isFinite(points)) throw new Error("userId i points su obavezni");
              await supabaseAdmin
                .from("user_credits")
                .upsert(
                  { user_id: userId, points_balance: Math.max(0, Math.floor(points)) },
                  { onConflict: "user_id" }
                );
              return Response.json({ ok: true });
            }

            case "add-payment": {
              const userId: string = body.userId;
              const cents = Number(body.cents);
              if (!userId || !Number.isFinite(cents) || cents <= 0)
                throw new Error("userId i iznos (centi) su obavezni");
              const { data: settings } = await supabaseAdmin
                .from("site_settings")
                .select("cents_per_1000_points")
                .eq("id", 1)
                .single();
              const rate = settings?.cents_per_1000_points ?? 20;
              const points = Math.floor((cents / rate) * 1000);
              const { data: existing } = await supabaseAdmin
                .from("user_credits")
                .select("points_balance, total_paid_cents")
                .eq("user_id", userId)
                .maybeSingle();
              await supabaseAdmin.from("user_credits").upsert(
                {
                  user_id: userId,
                  points_balance: (existing?.points_balance ?? 0) + points,
                  total_paid_cents: (existing?.total_paid_cents ?? 0) + Math.floor(cents),
                },
                { onConflict: "user_id" }
              );
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
              const { error } = await supabaseAdmin
                .from("generations")
                .delete()
                .eq("id", projectId);
              if (error) throw error;
              return Response.json({ ok: true });
            }

            case "reset-password": {
              const email: string = body.email;
              if (!email) throw new Error("email je obavezan");
              const { error } = await supabaseAdmin.auth.admin.generateLink({
                type: "recovery",
                email,
              });
              if (error) throw error;
              return Response.json({ ok: true });
            }

            default:
              return new Response(JSON.stringify({ error: "Nepoznata akcija" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Greška";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
