// deno-lint-ignore-file no-explicit-any
/**
 * pluggy-sync (v2) — Motor de Tratamento
 * Banco → Pluggy → Motor de Tratamento → Precis Finance
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { emptyCounts, projectItemToPrecis } from "../_shared/precis-projection.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLUGGY_ID = Deno.env.get("PLUGGY_CLIENT_ID")!;
const PLUGGY_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function pluggyApiKey(): Promise<string> {
  const r = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: PLUGGY_ID, clientSecret: PLUGGY_SECRET }),
  });
  if (!r.ok) throw new Error(`pluggy auth ${r.status}`);
  const j = await r.json();
  return j.apiKey as string;
}

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json",
  };
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data } = await anon.auth.getUser();
  return data.user?.id ?? null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: cors });

  let runId: string | null = null;

  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

    const body = await req.json().catch(() => ({}));
    const item_id = body.item_id ?? body.itemId;
    if (!item_id) throw new Error("missing item_id");

    const apiKey = await pluggyApiKey();

    let { data: owned } = await admin
      .from("pluggy_items")
      .select("item_id, user_id")
      .eq("item_id", item_id)
      .maybeSingle();

    if (owned && owned.user_id !== userId) {
      return new Response(JSON.stringify({ error: "item não pertence ao usuário" }), { status: 403, headers: cors });
    }

    if (!owned) {
      const itemMeta = await fetch(`https://api.pluggy.ai/items/${item_id}`, {
        headers: { "X-API-KEY": apiKey },
      }).then((r) => r.json());
      await admin.from("pluggy_items").upsert({
        item_id,
        user_id: userId,
        connector_id: itemMeta.connector?.id ?? null,
        connector_name: itemMeta.connector?.name ?? null,
        status: itemMeta.status ?? null,
        execution_status: itemMeta.executionStatus ?? null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const { data: run, error: runErr } = await admin
      .from("precis_sync_runs")
      .insert({ user_id: userId, item_id, scope: "item", status: "running", counts: {} })
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = run.id as string;

    const counts = await projectItemToPrecis(admin, {
      userId,
      itemId: item_id,
      runId,
      apiKey,
      counts: emptyCounts(),
    });

    await admin.from("precis_sync_runs").update({
      status: "ok",
      finished_at: new Date().toISOString(),
      counts,
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, counts }), { headers: cors });
  } catch (e) {
    console.error("[pluggy-sync]", e);
    if (runId) {
      await admin.from("precis_sync_runs").update({
        status: "error",
        finished_at: new Date().toISOString(),
        message: (e as Error).message,
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});
