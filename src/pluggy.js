// Integração Pluggy no frontend do PrecisFinance.
//
// Fluxo:
// 1. Usuário clica em "Conectar banco" no app.
// 2. openPluggyConnect() pede um accessToken à Edge Function pluggy-connect-token
//    (que usa o SEU PLUGGY_CLIENT_ID/SECRET e amarra o item a user.id).
// 3. Widget Pluggy Connect abre, usuário faz login no banco.
// 4. onSuccess -> pluggy-sync popula pluggy_items/accounts/transactions no Supabase.
//    O webhook também grava (redundância saudável).
// 5. pluggy-list-items lê da tabela filtrando por user_id (RLS).

// ---------------- Widget Pluggy Connect --------------------------------------

// Pede um connectToken à Edge Function e abre o widget.
// opts: { onSuccess?, onError?, onClose?, itemId? (reconectar) }
export async function openPluggyConnect(supabaseClient, opts = {}) {
  if (typeof window === "undefined" || !window.PluggyConnect) {
    throw new Error(
      "Widget Pluggy não carregado. Confirme o <script> da Pluggy no index.html.",
    );
  }

  const { data, error } = await supabaseClient.functions.invoke(
    "pluggy-connect-token",
    { body: opts.itemId ? { itemId: opts.itemId } : {} },
  );
  if (error) throw error;
  const accessToken = data?.accessToken;
  if (!accessToken) throw new Error("connect-token: accessToken vazio");

  const connect = new window.PluggyConnect({
    connectToken: accessToken,
    includeSandbox: false,
    ...(opts.itemId ? { updateItem: opts.itemId } : {}),
    onSuccess: async (payload) => {
      try {
        const item = payload?.item;
        if (item?.id) {
          // Sincroniza imediatamente pra não depender só do webhook.
          await syncItem(supabaseClient, item.id);
        }
        opts.onSuccess?.(item);
      } catch (e) {
        console.error("[pluggy] sync pós-conexão falhou", e);
        opts.onError?.(e);
      }
    },
    onError: (err) => {
      console.error("[pluggy] widget error", err);
      opts.onError?.(err);
    },
    onClose: () => {
      opts.onClose?.();
    },
  });

  connect.init();
  return connect;
}

// ---------------- Sincronização via Edge Functions ---------------------------

// Lista os items do usuário (lidos da tabela pluggy_items via Edge Function).
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

// Sincroniza todos os items conectados pelo usuário.
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

// ---------------- Leitura dos dados (RLS já filtra por usuário) --------------

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
