import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_USER = "gabrijelhor";
const ADMIN_PASS = "Bmwcir8cl";

function checkAuth(body: any) {
  return body?.adminUser === ADMIN_USER && body?.adminPass === ADMIN_PASS;
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
              return Response.json({ users });
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
