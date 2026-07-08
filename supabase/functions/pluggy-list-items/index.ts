// Lista os items (bancos) visíveis pelo Pluggy Demo App via proxy do MeuPluggy.
// Deploy: supabase functions deploy pluggy-list-items
import {
  corsHeaders,
  getApiKey,
  getUser,
  json,
  pluggyGet,
} from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const apiKey = await getApiKey();
    const resp = await pluggyGet(`/items`, apiKey);
    const items = resp.results ?? resp ?? [];

    // Devolve só o essencial pro frontend.
    const slim = items.map((it: any) => ({
      itemId: it.id,
      status: it.status ?? null,
      executionStatus: it.executionStatus ?? null,
      connectorId: it.connector?.id ?? null,
      connectorName: it.connector?.name ?? null,
      updatedAt: it.updatedAt ?? null,
    }));

    return json({ ok: true, items: slim });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
