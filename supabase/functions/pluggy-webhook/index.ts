// Webhook público chamado pelo Pluggy quando um item é atualizado.
// Deploy com: supabase functions deploy pluggy-webhook --no-verify-jwt
import {
  adminClient,
  corsHeaders,
  getApiKey,
  json,
  syncItem,
} from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    // Verificação opcional por secret (?secret=...) — recomendado.
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

    // Só reagimos a eventos que mudam dados.
    const shouldSync =
      itemId &&
      (event.startsWith("item/") || event.startsWith("transactions/"));
    if (!shouldSync) return json({ ok: true, ignored: event });

    const admin = adminClient();

    // Descobre o dono do item pelo mapeamento salvo no connect.
    const { data: item } = await admin
      .from("pluggy_items")
      .select("user_id")
      .eq("item_id", itemId)
      .maybeSingle();

    if (!item) {
      // Item ainda não mapeado (ex.: primeiro webhook antes do sync). Ignora.
      return json({ ok: true, unmapped: itemId });
    }

    const apiKey = await getApiKey();
    await syncItem(admin, apiKey, item.user_id, itemId!);

    return json({ ok: true, synced: itemId });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});