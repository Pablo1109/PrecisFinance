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

const PLUGGY_CONNECT_CDN_URLS = [
  "https://cdn.pluggy.ai/pluggy-connect/v2.8.0/pluggy-connect.js",
  "https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js",
];

let pluggyConnectLoadPromise = null;

function getFunctionError(error, data) {
  return error?.message || data?.error || data?.message || "Erro desconhecido";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => script.src === src);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error(`Tempo esgotado ao carregar ${src}`)), 12000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error(`Falha ao carregar ${src}`));
    };
    if (!existing) document.head.appendChild(script);
  });
}

async function ensurePluggyConnectLoaded() {
  if (typeof window !== "undefined" && window.PluggyConnect) return;
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Pluggy Connect só pode abrir no navegador.");
  }
  if (!pluggyConnectLoadPromise) {
    pluggyConnectLoadPromise = (async () => {
      const errors = [];
      for (const src of PLUGGY_CONNECT_CDN_URLS) {
        try {
          await loadScript(src);
          if (window.PluggyConnect) return;
          errors.push(`${src}: carregou, mas window.PluggyConnect não apareceu`);
        } catch (error) {
          errors.push(error?.message || String(error));
        }
      }
      throw new Error(`Widget Pluggy não carregou. Verifique bloqueadores/CDN. Detalhes: ${errors.join(" | ")}`);
    })();
  }
  await pluggyConnectLoadPromise;
}

// Pede um connectToken à Edge Function e abre o widget.
// opts: { onSuccess?, onError?, onClose?, itemId? (reconectar) }
export async function openPluggyConnect(supabaseClient, opts = {}) {
  await ensurePluggyConnectLoaded();

  const { data, error } = await supabaseClient.functions.invoke(
    "pluggy-connect-token",
    { body: opts.itemId ? { itemId: opts.itemId } : {} },
  );
  if (error || data?.error) throw new Error(`pluggy-connect-token: ${getFunctionError(error, data)}`);
  const accessToken = data?.accessToken;
  if (!accessToken) throw new Error("connect-token: accessToken vazio");

  const connect = new window.PluggyConnect({
    connectToken: accessToken,
    includeSandbox: false,
    ...(opts.itemId ? { updateItem: opts.itemId } : {}),
    onSuccess: async (payload) => {
      try {
        const item = payload?.item || payload;
        const itemId = item?.id || item?.itemId || payload?.itemId;
        if (itemId) {
          // Sincroniza imediatamente pra não depender só do webhook.
          await syncItem(supabaseClient, itemId);
        }
        opts.onSuccess?.({ ...item, id: itemId || item?.id });
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

  await connect.init();
  return connect;
}

// ---------------- Sincronização via Edge Functions ---------------------------

// Lista os items do usuário (lidos da tabela pluggy_items via Edge Function).
export async function listRemoteItems(supabaseClient) {
  const { data, error } = await supabaseClient.functions.invoke(
    "pluggy-list-items",
    { body: {} },
  );
  if (error || data?.error) throw new Error(`pluggy-list-items: ${getFunctionError(error, data)}`);
  return data?.items ?? [];
}

// Sincroniza um item específico (contas, transações, cartões, investimentos).
export async function syncItem(supabaseClient, itemId, { full = false } = {}) {
  const { data, error } = await supabaseClient.functions.invoke("pluggy-sync", {
    body: { itemId, full },
  });
  if (error || data?.error) throw new Error(`pluggy-sync: ${getFunctionError(error, data)}`);
  return data;
}

// Sincroniza TODOS os items — agora centralizado no servidor (pluggy-sync-all).
// Faz fallback para o loop no cliente se a função server-side não existir ainda.
export async function syncAll(supabaseClient, { full = false } = {}) {
  const { data, error } = await supabaseClient.functions.invoke("pluggy-sync-all", {
    body: { full },
  });

  if (!error && data && !data.error) {
    const results = data.results ?? [];
    const errors = results
      .filter((r) => (r.errors || []).length > 0)
      .map((r) => ({ itemId: r.itemId, error: (r.errors || []).map((e) => `${e.step}: ${e.message}`).join(" | ") }));
    return { items: data.synced ?? 0, total: data.total ?? results.length, errors, totals: data.totals };
  }

  // Fallback: função nova ainda não publicada — usa o modo antigo.
  const remote = await listRemoteItems(supabaseClient);
  let ok = 0;
  const errors = [];
  for (const it of remote) {
    try {
      await syncItem(supabaseClient, it.itemId, { full });
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

export async function getPluggyBills(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_bills")
    .select("*")
    .order("due_date", { ascending: false });
  if (error) {
    console.warn("[pluggy] getPluggyBills:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPluggyLoans(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_loans")
    .select("*")
    .order("due_date", { ascending: true });
  if (error) {
    console.warn("[pluggy] getPluggyLoans:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getSyncLogs(supabaseClient, { limit = 30 } = {}) {
  const { data, error } = await supabaseClient
    .from("pluggy_sync_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[pluggy] getSyncLogs:", error.message);
    return [];
  }
  return data ?? [];
}

// ---------------- Aprendizado de categorias ---------------------------------

export async function getCategoryRules(supabaseClient) {
  const { data, error } = await supabaseClient
    .from("pluggy_category_rules")
    .select("*");
  if (error) {
    console.warn("[pluggy] getCategoryRules:", error.message);
    return [];
  }
  return data ?? [];
}

// Salva/atualiza uma regra de categoria aprendida (UPSERT por padrão).
export async function saveCategoryRule(supabaseClient, userId, { matchType, pattern, categoryId, subcategory }) {
  if (!userId || !pattern) return;
  const { error } = await supabaseClient
    .from("pluggy_category_rules")
    .upsert(
      {
        user_id: userId,
        match_type: matchType || "keyword",
        pattern: String(pattern).toLowerCase().trim(),
        category_id: categoryId || null,
        subcategory: subcategory || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,match_type,pattern" },
    );
  if (error) console.warn("[pluggy] saveCategoryRule:", error.message);
}

// Persiste o override de categoria numa transação do Open Finance.
export async function setTransactionCategory(supabaseClient, txId, { category, subcategory }) {
  if (!txId) return;
  const { error } = await supabaseClient
    .from("pluggy_transactions")
    .update({ user_category: category || null, user_subcategory: subcategory || null })
    .eq("tx_id", txId);
  if (error) console.warn("[pluggy] setTransactionCategory:", error.message);
}

// Atualiza o rótulo "Dono" de um item (ex.: "Eu" / "Namorada").
export async function setItemOwnerLabel(supabaseClient, itemId, label) {
  const { error } = await supabaseClient
    .from("pluggy_items")
    .update({ owner_label: label || null })
    .eq("item_id", itemId);
  if (error) throw error;
}

