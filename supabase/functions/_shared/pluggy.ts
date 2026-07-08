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

// Cliente admin (service_role) — ignora RLS. Só nas Edge Functions.
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// Valida o JWT do usuário que veio no header Authorization e devolve o user.
export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
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
      clientId: Deno.env.get("PLUGGY_CLIENT_ID"),
      clientSecret: Deno.env.get("PLUGGY_CLIENT_SECRET"),
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
  const item = await pluggyGet(`/items/${itemId}`, apiKey);
  await admin.from("pluggy_items").upsert({
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
  const accountsResp = await pluggyGet(`/accounts?itemId=${itemId}`, apiKey);
  const accounts = accountsResp.results ?? [];

  for (const acc of accounts) {
    await admin.from("pluggy_accounts").upsert({
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
        `/transactions?accountId=${acc.id}&from=${from}&page=${page}&pageSize=${pageSize}`,
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
        }));
        await admin.from("pluggy_transactions").upsert(rows);
      }
      const totalPages = txResp.totalPages ?? 1;
      if (page >= totalPages) break;
      page++;
    }
  }

  // ---- Investimentos ----
  try {
    const invResp = await pluggyGet(`/investments?itemId=${itemId}`, apiKey);
    const investments = invResp.results ?? [];
    for (const inv of investments) {
      await admin.from("pluggy_investments").upsert({
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
    }
  } catch (_e) {
    // Nem todo conector tem investimentos — ignora silenciosamente.
  }

  return { accounts: accounts.length };
}