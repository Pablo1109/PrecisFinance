// Sincroniza os dados de UM item Pluggy para o Supabase via SyncService.
// Chamado pelo frontend logo após conectar um banco (onSuccess do widget)
// ou ao clicar em "Atualizar" numa conexão.
import {
  adminClient,
  corsHeaders,
  getApiKey,
  getUser,
  json,
  syncItem,
} from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const itemId = body?.itemId as string | undefined;
    if (!itemId) return json({ error: "itemId é obrigatório" }, 400);

    const admin = adminClient();
    const apiKey = await getApiKey();

    // Segurança: se o item já existe, precisa pertencer a este usuário.
    const { data: existing } = await admin
      .from("pluggy_items")
      .select("user_id")
      .eq("item_id", itemId)
      .maybeSingle();
    if (existing && existing.user_id !== user.id) {
      return json({ error: "Item não pertence a este usuário" }, 403);
    }

    const result = await syncItem(admin, apiKey, user.id, itemId, {
      incremental: body?.full ? false : true,
    });

    // ok=true mesmo com erros parciais: o front decide o que mostrar.
    return json({ ok: result.errors.length === 0, result });
  } catch (e) {
    console.error(e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
