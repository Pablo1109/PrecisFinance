import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CONCURRENCY = 4;

async function runWithLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const my = idx++;
      out[my] = await fn(items[my]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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
  const list = items ?? [];

  const results = await runWithLimit(list, CONCURRENCY, async (it) => {
    const t0 = Date.now();
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pluggy-sync`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify({ item_id: it.item_id }),
      });
      const body = r.ok ? await r.json().catch(() => ({})) : await r.text();
      return { itemId: it.item_id, ok: r.ok, ms: Date.now() - t0, errors: r.ok ? [] : [{ step: "sync", message: String(body) }] };
    } catch (e) {
      return { itemId: it.item_id, ok: false, ms: Date.now() - t0, errors: [{ step: "sync", message: (e as Error).message }] };
    }
  });

  const synced = results.filter((r) => r.ok).length;
  return new Response(JSON.stringify({
    synced, total: list.length, results,
    totals: { concurrency: CONCURRENCY, elapsedMs: results.reduce((s, r) => s + r.ms, 0) },
  }), { headers: cors });
});
