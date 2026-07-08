// Lista os items (bancos) do usuário autenticado.
// A API do Pluggy NÃO expõe GET /items (listagem) — só GET /items/{id}.
// Portanto lemos os itemIds da tabela pluggy_items (populada pelo sync/webhook)
// e, opcionalmente, enriquecemos com o status atual consultando cada item.
//
// Deploy: supabase functions deploy pluggy-list-items
import {
  adminClient,
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

    const url = new URL(req.url);
    // ?refresh=1 força buscar o status atualizado em cada item no Pluggy.
    const refresh = url.searchParams.get("refresh") === "1";

    const admin = adminClient();
    const { data: rows, error } = await admin
      .from("pluggy_items")
      .select(
        "item_id, status, execution_status, connector_id, connector_name, updated_at",
      )
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    let items = (rows ?? []).map((r) => ({
      itemId: r.item_id,
      status: r.status,
      executionStatus: r.execution_status,
      connectorId: r.connector_id,
      connectorName: r.connector_name,
      updatedAt: r.updated_at,
    }));

    if (refresh && items.length > 0) {
      const apiKey = await getApiKey();
      items = await Promise.all(
        items.map(async (it) => {
          try {
            const fresh = await pluggyGet(`/items/${it.itemId}`, apiKey);
            return {
              itemId: fresh.id,
              status: fresh.status ?? it.status,
              executionStatus: fresh.executionStatus ?? it.executionStatus,
              connectorId: fresh.connector?.id ?? it.connectorId,
              connectorName: fresh.connector?.name ?? it.connectorName,
              updatedAt: fresh.updatedAt ?? it.updatedAt,
            };
          } catch (_e) {
            return it; // se o Pluggy falhar em 1 item, mantém o cache do banco
          }
        }),
      );
    }

    return json({ ok: true, items });
  } catch (e) {
    console.error("pluggy-list-items error:", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
