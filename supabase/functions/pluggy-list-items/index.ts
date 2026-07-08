// Lista os items Pluggy do usuário autenticado.
// IMPORTANTE: A API do Pluggy NÃO tem GET /items — só GET /items/{id}.
// Por isso lemos da tabela pluggy_items (populada pelo webhook / pluggy-sync)
// e, se ?refresh=1, buscamos cada item individualmente no Pluggy.

import { corsHeaders, getApiKey, getUser, json, pluggyGet } from "../_shared/pluggy.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[pluggy-list-items] start", { method: req.method, url: req.url });

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await admin
      .from("pluggy_items")
      .select("item_id, status, execution_status, connector_id, connector_name, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[pluggy-list-items] db error", error);
      return json({ error: error.message }, 500);
    }

    let items = (rows ?? []).map((r) => ({
      itemId: r.item_id,
      status: r.status,
      executionStatus: r.execution_status,
      connectorId: r.connector_id,
      connectorName: r.connector_name,
      updatedAt: r.updated_at,
    }));

    const url = new URL(req.url);
    if (url.searchParams.get("refresh") === "1" && items.length > 0) {
      const apiKey = await getApiKey();
      items = await Promise.all(items.map(async (it) => {
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
        } catch (e) {
          console.warn("[pluggy-list-items] refresh falhou", it.itemId, e);
          return it;
        }
      }));
    }

    console.log("[pluggy-list-items] ok", { count: items.length });
    return json({ ok: true, items });
  } catch (e) {
    console.error("[pluggy-list-items] fatal", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

