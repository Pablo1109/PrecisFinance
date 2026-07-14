import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const cors = {
    "access-control-allow-origin": req.headers.get("origin") ?? "*",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data: u } = await anon.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

  const { data: items } = await admin.from("pluggy_items").select("item_id").eq("user_id", userId);
  const results: Array<{ item_id: string; ok: boolean; error?: string }> = [];
  for (const it of items ?? []) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-sync`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({ item_id: it.item_id }),
      });
      results.push({ item_id: it.item_id, ok: r.ok, error: r.ok ? undefined : await r.text() });
    } catch (e) {
      results.push({ item_id: it.item_id, ok: false, error: (e as Error).message });
    }
  }
  return new Response(JSON.stringify({ results }), { headers: cors });
});
