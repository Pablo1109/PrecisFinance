// Integração Pluggy no frontend do PrecisFinance.
//
// Modelo atual (sem CNPJ): as conexões bancárias ficam no MeuPluggy
// (meu.pluggy.ai). O Pluggy Demo App (dashboard.pluggy.ai) enxerga esses
// items via proxy e nossas Edge Functions usam o clientId/clientSecret
// do Demo App pra listar e sincronizar.
//
// -> Adicionar/remover banco: fazer em meu.pluggy.ai (o usuário).
// -> Sincronizar tudo: botão no app chama pluggy-list-items + pluggy-sync.

// Lista os items remotos vistos pelo Pluggy (via Edge Function).
export async function listRemoteItems(supabaseClient) {
  const { data, error } = await supabaseClient.functions.invoke(
    "pluggy-list-items",
    { body: {} },
  );
  if (error) throw error;
  return data?.items ?? [];
}

// Sincroniza um item específico (contas, transações, cartões, investimentos).
export async function syncItem(supabaseClient, itemId) {
  const { data, error } = await supabaseClient.functions.invoke("pluggy-sync", {
    body: { itemId },
  });
  if (error) throw error;
  return data;
}

// Sincroniza todos os items visíveis no Pluggy (fonte da verdade = remoto).
// Retorna { items: N } pro toast.
export async function syncAll(supabaseClient) {
  const remote = await listRemoteItems(supabaseClient);
  let ok = 0;
  const errors = [];
  for (const it of remote) {
    try {
      await syncItem(supabaseClient, it.itemId);
      ok++;
    } catch (e) {
      console.error("sync falhou", it.itemId, e);
      errors.push({ itemId: it.itemId, error: String(e?.message || e) });
    }
  }
  return { items: ok, total: remote.length, errors };
}

// ---------------- Leitura dos dados (RLS já filtra por usuário) -------------

export async function getPluggyItems(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_items")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPluggyAccounts(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_accounts")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getPluggyCards(supabaseClient) {
  const accounts = await getPluggyAccounts(supabaseClient);
  return accounts.filter((a) => a.type === "CREDIT");
}

export async function getPluggyTransactions(supabaseClient, { limit = 200 } = {}) {
  const { data, error } = await supabaseClient
    .from("pluggy_transactions")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPluggyInvestments(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_investments")
    .select("*")
    .order("balance", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Atualiza o rótulo "Dono" de um item (ex.: "Eu" / "Namorada").
export async function setItemOwnerLabel(supabaseClient, itemId, label) {
  const { error } = await supabaseClient
    .from("pluggy_items")
    .update({ owner_label: label || null })
    .eq("item_id", itemId);
  if (error) throw error;
}
