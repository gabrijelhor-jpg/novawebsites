import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getPublishedSite = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({
    slug: String(input.slug ?? "").toLowerCase().trim().replace(/^\/+|\/+$/g, ""),
  }))
  .handler(async ({ data }) => {
    if (!/^[a-z0-9-]{1,48}$/.test(data.slug)) return null;
    const { data: site, error } = await supabaseAdmin
      .from("generations")
      .select("title, html, public_slug, updated_at")
      .eq("is_published", true)
      .ilike("public_slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    return site;
  });