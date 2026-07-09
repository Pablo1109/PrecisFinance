// Helpers compartilhados para as Edge Functions do Pluggy.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const PLUGGY_API = "https://api.pluggy.ai";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

// Cliente admin (service_role) — ignora RLS. Só nas Edge Functions.
export function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

// Valida o JWT do usuário que veio no header Authorization e devolve o user.
export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// Autentica no Pluggy e retorna a apiKey (válida por ~2h).
export async function getApiKey(): Promise<string> {
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: requireEnv("PLUGGY_CLIENT_ID"),
      clientSecret: requireEnv("PLUGGY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    throw new Error(`Pluggy /auth falhou [${res.status}]: ${await res.text()}`);
  }
  const data = await res.json();
  return data.apiKey as string;
}

export async function pluggyGet(path: string, apiKey: string) {
  const res = await fetch(`${PLUGGY_API}${path}`, {
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Pluggy GET ${path} [${res.status}]: ${await res.text()}`);
  }
  return res.json();
}

async function checkedUpsert(admin: SupabaseClient, table: string, payload: any, options?: { onConflict?: string }) {
  const query = options ? admin.from(table).upsert(payload, options) : admin.from(table).upsert(payload);
  const { error } = await query;
  if (error) throw new Error(`Supabase upsert ${table}: ${error.message}`);
}

// ISO date (YYYY-MM-DD) de N dias atrás.
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Sincroniza TODOS os dados de um item (contas, transações, cartões, investimentos).
// Grava usando o cliente admin, sempre associado ao userId dono do item.
export async function syncItem(
  admin: SupabaseClient,
  apiKey: string,
  userId: string,
  itemId: string,
  opts: { transactionsSinceDays?: number } = {},
) {
  const sinceDays = opts.transactionsSinceDays ?? 365;
  const from = daysAgo(sinceDays);

  // ---- Item (metadados) ----
  console.log("[pluggy-sync] item", { itemId, userId });
  const item = await pluggyGet(`/items/${itemId}`, apiKey);
  await checkedUpsert(admin, "pluggy_items", {
    item_id: itemId,
    user_id: userId,
    connector_id: item.connector?.id ?? null,
    connector_name: item.connector?.name ?? null,
    status: item.status ?? null,
    execution_status: item.executionStatus ?? null,
    last_synced_at: new Date().toISOString(),
    error: item.error?.message ?? null,
    raw: item,
    updated_at: new Date().toISOString(),
  });

  // ---- Contas (bancárias + cartões) ----
  const accountsResp = await pluggyGet(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey);
  const accounts = accountsResp.results ?? [];
  let transactionCount = 0;
  let investmentCount = 0;

  for (const acc of accounts) {
    await checkedUpsert(admin, "pluggy_accounts", {
      account_id: acc.id,
      item_id: itemId,
      user_id: userId,
      type: acc.type ?? null,
      subtype: acc.subtype ?? null,
      name: acc.name ?? null,
      number: acc.number ?? null,
      marketing_name: acc.marketingName ?? null,
      balance: acc.balance ?? null,
      currency_code: acc.currencyCode ?? null,
      credit_data: acc.creditData ?? null,
      raw: acc,
      updated_at: new Date().toISOString(),
    });

    // ---- Transações da conta (paginado) ----
    let page = 1;
    const pageSize = 500;
    while (true) {
      const txResp = await pluggyGet(
        `/transactions?accountId=${encodeURIComponent(acc.id)}&from=${encodeURIComponent(from)}&page=${page}&pageSize=${pageSize}`,
        apiKey,
      );
      const txs = txResp.results ?? [];
      if (txs.length > 0) {
        const rows = txs.map((t: any) => ({
          tx_id: t.id,
          account_id: acc.id,
          user_id: userId,
          date: t.date ? String(t.date).slice(0, 10) : null,
          description: t.description ?? null,
          amount: t.amount ?? null,
          currency_code: t.currencyCode ?? null,
          category: t.category ?? null,
          type: t.type ?? null,
          raw: t,
          updated_at: new Date().toISOString(),
        }));
        await checkedUpsert(admin, "pluggy_transactions", rows, { onConflict: "tx_id" });
        transactionCount += rows.length;
      }
      const totalPages = txResp.totalPages ?? 1;
      if (page >= totalPages) break;
      page++;
    }
  }

  // ---- Investimentos ----
  try {
    const invResp = await pluggyGet(`/investments?itemId=${encodeURIComponent(itemId)}`, apiKey);
    const investments = invResp.results ?? [];
    for (const inv of investments) {
      await checkedUpsert(admin, "pluggy_investments", {
        investment_id: inv.id,
        item_id: itemId,
        user_id: userId,
        name: inv.name ?? null,
        type: inv.type ?? null,
        subtype: inv.subtype ?? null,
        balance: inv.balance ?? null,
        amount: inv.amount ?? null,
        currency_code: inv.currencyCode ?? null,
        raw: inv,
        updated_at: new Date().toISOString(),
      });
      investmentCount++;
    }
  } catch (_e) {
    // Nem todo conector tem investimentos — ignora silenciosamente.
  }

  console.log("[pluggy-sync] ok", { itemId, accounts: accounts.length, transactions: transactionCount, investments: investmentCount });
  return { accounts: accounts.length, transactions: transactionCount, investments: investmentCount };
}