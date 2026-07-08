// Integração Pluggy no frontend do PrecisFinance.
// Requer o script do widget no index.html:
//   <script src="https://cdn.pluggy.ai/pluggy-connect/v2.9.4/pluggy-connect.js"></script>

// Abre o widget Pluggy Connect para o usuário autorizar um banco.
// supabaseClient: o client já autenticado do app.
// opts.itemId (opcional): reabrir uma conexão existente para atualizar/reautorizar.
// opts.onSuccess({ itemId }): callback após conectar e sincronizar.
export async function connectBank(supabaseClient, opts = {}) {
  if (typeof window.PluggyConnect === "undefined") {
    throw new Error(
      "Widget Pluggy não carregado. Adicione o <script> do pluggy-connect no index.html.",
    );
  }

  // 1) Pega um connectToken da Edge Function (que guarda o clientSecret).
  const { data, error } = await supabaseClient.functions.invoke(
    "pluggy-connect-token",
    { body: opts.itemId ? { itemId: opts.itemId } : {} },
  );
  if (error) throw error;
  if (!data?.accessToken) throw new Error("connectToken não retornado");

  // 2) Abre o widget.
  return new Promise((resolve, reject) => {
    const pluggy = new window.PluggyConnect({
      connectToken: data.accessToken,
      includeSandbox: false, // PRODUÇÃO. Troque para true só para testar.
      onSuccess: async (itemData) => {
        const itemId = itemData?.item?.id;
        try {
          // 3) Dispara a primeira sincronização.
          if (itemId) await syncItem(supabaseClient, itemId);
          if (opts.onSuccess) await opts.onSuccess({ itemId });
          resolve({ itemId });
        } catch (e) {
          reject(e);
        }
      },
      onError: (err) => reject(err),
    });
    pluggy.init();
  });
}

// Sincroniza um item específico (contas, transações, cartões, investimentos).
export async function syncItem(supabaseClient, itemId) {
  const { data, error } = await supabaseClient.functions.invoke("pluggy-sync", {
    body: { itemId },
  });
  if (error) throw error;
  return data;
}

// Sincroniza todos os itens conectados do usuário.
export async function syncAll(supabaseClient) {
  const items = await getPluggyItems(supabaseClient);
  for (const item of items) {
    await syncItem(supabaseClient, item.item_id);
  }
  return items.length;
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

// Desconecta um banco (apaga o item; contas/transações caem em cascata).
export async function disconnectItem(supabaseClient, itemId) {
  const { error } = await supabaseClient
    .from("pluggy_items")
    .delete()
    .eq("item_id", itemId);
  if (error) throw error;
}