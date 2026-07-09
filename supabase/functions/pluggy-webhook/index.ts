// Webhook público chamado pelo Pluggy quando um item é atualizado.
// Deploy com: supabase functions deploy pluggy-webhook --no-verify-jwt
import {
  adminClient,
  corsHeaders,
  getApiKey,
  json,
  syncItem,
} from "../_shared/pluggy.ts";
import { emptyCounts, projectItemToPrecis } from "../_shared/precis-projection.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const expected = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
    if (expected) {
      const url = new URL(req.url);
      const got = url.searchParams.get("secret") ??
        req.headers.get("x-webhook-secret");
      if (got !== expected) return json({ error: "secret inválido" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const event: string = payload.event ?? "";
    const itemId: string | undefined = payload.itemId ?? payload.item?.id;

    const shouldSync =
      itemId &&
      (event.startsWith("item/") || event.startsWith("transactions/"));
    if (!shouldSync) return json({ ok: true, ignored: event });

    const admin = adminClient();

    const { data: item } = await admin
      .from("pluggy_items")
      .select("user_id")
      .eq("item_id", itemId)
      .maybeSingle();

    if (!item) {
      return json({ ok: true, unmapped: itemId });
    }

    const apiKey = await getApiKey();

    // 1. Sincroniza tabelas raw pluggy_*
    const result = await syncItem(admin, apiKey, item.user_id, itemId!, { incremental: true });

    // 2. Projeta no motor Precis (precis_cards, precis_entries, review queue)
    const { data: run } = await admin
      .from("precis_sync_runs")
      .insert({ user_id: item.user_id, item_id: itemId, scope: "item", status: "running", counts: {} })
      .select("id")
      .single();

    let precisCounts = emptyCounts();
    if (run?.id) {
      precisCounts = await projectItemToPrecis(admin, {
        userId: item.user_id,
        itemId: itemId!,
        runId: run.id,
        apiKey,
        counts: emptyCounts(),
      });
      await admin.from("precis_sync_runs").update({
        status: result.errors.length ? "partial" : "ok",
        finished_at: new Date().toISOString(),
        counts: precisCounts,
      }).eq("id", run.id);
    }

    return json({ ok: result.errors.length === 0, synced: itemId, result, precis: precisCounts });
  } catch (e) {
    console.error(e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
