// Sincroniza TODOS os items conectados pelo usuário — no servidor.
// Centraliza a sincronização (substitui o loop feito no cliente),
// devolvendo um resumo consolidado + erros por item.
import {
  adminClient,
  corsHeaders,
  getApiKey,
  getUser,
  json,
  syncItem,
  type SyncResult,
} from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const full = Boolean(body?.full);

    const admin = adminClient();
    const { data: items, error } = await admin
      .from("pluggy_items")
      .select("item_id")
      .eq("user_id", user.id);
    if (error) return json({ error: error.message }, 500);

    const list = (items ?? []).map((r) => r.item_id);
    if (!list.length) {
      return json({ ok: true, total: 0, synced: 0, results: [] });
    }

    const apiKey = await getApiKey();
    const results: SyncResult[] = [];
    let synced = 0;
    for (const itemId of list) {
      try {
        const r = await syncItem(admin, apiKey, user.id, itemId, { incremental: !full });
        results.push(r);
        if (r.errors.length === 0) synced++;
      } catch (e) {
        results.push({
          itemId,
          accounts: 0, cards: 0, transactions: 0, investments: 0,
          loans: 0, bills: 0, removed: 0,
          errors: [{ step: "fatal", message: String(e instanceof Error ? e.message : e) }],
        });
      }
    }

    const totals = results.reduce((acc, r) => ({
      accounts: acc.accounts + r.accounts,
      cards: acc.cards + r.cards,
      transactions: acc.transactions + r.transactions,
      investments: acc.investments + r.investments,
      loans: acc.loans + r.loans,
      bills: acc.bills + r.bills,
    }), { accounts: 0, cards: 0, transactions: 0, investments: 0, loans: 0, bills: 0 });

    return json({ ok: synced === list.length, total: list.length, synced, totals, results });
  } catch (e) {
    console.error(e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
