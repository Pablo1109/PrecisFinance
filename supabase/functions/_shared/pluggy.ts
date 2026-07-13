// =====================================================================
// SyncService compartilhado das Edge Functions do Pluggy (Open Finance).
//
// Responsável por, em UMA única passagem por item:
//   - buscar TODOS os recursos: item, contas, cartões, transações,
//     investimentos e empréstimos;
//   - fazer UPSERT (nunca INSERT cego) para evitar duplicação;
//   - tratar erro POR ETAPA e POR CONTA (uma falha não derruba o item);
//   - sincronizar de forma incremental (só o delta de transações);
//   - remover registros órfãos (que o banco não retorna mais);
//   - registrar histórico/logs detalhados em pluggy_sync_logs;
//   - devolver um resultado estruturado com contagens e erros.
// =====================================================================
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

type PluggyTxCursorPage = {
  results?: unknown[];
  next?: string | null;
};

/**
 * Lista transações via GET /v2/transactions (paginação por cursor).
 * O endpoint legado /transactions (page/pageSize) está depreciado.
 */
export async function pluggyListTransactions(
  apiKey: string,
  accountId: string,
  dateFrom?: string,
  onPage?: (txs: any[]) => Promise<void> | void,
): Promise<any[]> {
  const all: any[] = [];
  let path =
    `/v2/transactions?accountId=${encodeURIComponent(accountId)}` +
    (dateFrom ? `&dateFrom=${encodeURIComponent(dateFrom)}` : "");

  let guard = 0;
  while (path && guard < 200) {
    guard++;
    const page = (await pluggyGet(path, apiKey)) as PluggyTxCursorPage;
    const txs = (page.results ?? []) as any[];
    if (txs.length) {
      all.push(...txs);
      if (onPage) await onPage(txs);
    }
    // `next` vem como query string completa, ex.: "?accountId=...&after=..."
    const next = page.next;
    if (!next) break;
    path = next.startsWith("/") ? next : `/v2/transactions${next.startsWith("?") ? next : `?${next}`}`;
  }
  return all;
}

// ------------------------------------------------------------------ helpers

const nowIso = () => new Date().toISOString();

// ISO date (YYYY-MM-DD) de N dias atrás.
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Normaliza qualquer data para YYYY-MM-DD (ou null se inválida).
function isoDate(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function checkedUpsert(
  admin: SupabaseClient,
  table: string,
  payload: unknown,
  options?: { onConflict?: string },
) {
  const query = options ? admin.from(table).upsert(payload, options) : admin.from(table).upsert(payload);
  const { error } = await query;
  if (error) throw new Error(`Supabase upsert ${table}: ${error.message}`);
}

// Registra uma linha no histórico de sincronização. Nunca lança (best-effort).
async function logSync(
  admin: SupabaseClient,
  row: {
    item_id: string;
    user_id: string;
    step: string;
    status: "ok" | "error" | "skip";
    counts?: Record<string, number>;
    message?: string | null;
  },
) {
  try {
    await admin.from("pluggy_sync_logs").insert({
      item_id: row.item_id,
      user_id: row.user_id,
      step: row.step,
      status: row.status,
      counts: row.counts ?? null,
      message: row.message ?? null,
      created_at: nowIso(),
    });
  } catch (e) {
    console.warn("[sync] logSync falhou (ignorado):", String(e));
  }
}

export type SyncResult = {
  itemId: string;
  accounts: number;
  cards: number;
  transactions: number;
  investments: number;
  loans: number;
  bills: number;
  removed: number;
  errors: { step: string; message: string }[];
};

// ==============================================================
//  SyncService — sincroniza um item por completo.
// ==============================================================
export async function syncItem(
  admin: SupabaseClient,
  apiKey: string,
  userId: string,
  itemId: string,
  opts: { transactionsSinceDays?: number; incremental?: boolean } = {},
): Promise<SyncResult> {
  const sinceDays = opts.transactionsSinceDays ?? 365;
  const incremental = opts.incremental ?? true;
  const result: SyncResult = {
    itemId,
    accounts: 0,
    cards: 0,
    transactions: 0,
    investments: 0,
    loans: 0,
    bills: 0,
    removed: 0,
    errors: [],
  };

  const fail = (step: string, e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[sync] ${step} falhou`, message);
    result.errors.push({ step, message });
    return logSync(admin, { item_id: itemId, user_id: userId, step, status: "error", message });
  };

  // ---- Item (metadados) — se isso falhar, o item inteiro é inválido ----
  let item: any;
  try {
    item = await pluggyGet(`/items/${itemId}`, apiKey);
    await checkedUpsert(admin, "pluggy_items", {
      item_id: itemId,
      user_id: userId,
      connector_id: item.connector?.id ?? null,
      connector_name: item.connector?.name ?? null,
      status: item.status ?? null,
      execution_status: item.executionStatus ?? null,
      last_synced_at: nowIso(),
      error: item.error?.message ?? null,
      raw: item,
      updated_at: nowIso(),
    });
    await logSync(admin, { item_id: itemId, user_id: userId, step: "item", status: "ok" });
  } catch (e) {
    await fail("item", e);
    await finalizeItemLog(admin, itemId, userId, result);
    return result; // sem o item não dá pra continuar
  }

  // ---- Contas (bancárias + cartões) ----
  let accounts: any[] = [];
  try {
    const accountsResp = await pluggyGet(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey);
    accounts = accountsResp.results ?? [];
  } catch (e) {
    await fail("accounts:list", e);
  }

  const seenAccountIds: string[] = [];

  for (const acc of accounts) {
    const isCredit = acc.type === "CREDIT";
    try {
      await checkedUpsert(admin, "pluggy_accounts", {
        account_id: acc.id,
        item_id: itemId,
        user_id: userId,
        type: acc.type ?? null,
        subtype: acc.subtype ?? null,
        name: acc.name ?? null,
        number: acc.number ?? null,
        marketing_name: acc.marketingName ?? null,
        balance: toNumber(acc.balance),
        currency_code: acc.currencyCode ?? null,
        credit_data: acc.creditData ?? null,
        raw: acc,
        updated_at: nowIso(),
      }, { onConflict: "account_id" });
      seenAccountIds.push(acc.id);
      result.accounts++;
      if (isCredit) result.cards++;
    } catch (e) {
      await fail(`account:${acc.id}`, e);
      continue; // uma conta ruim não derruba as demais
    }

    // ---- Fatura do cartão (bill) ----
    if (isCredit) {
      try {
        const billsResp = await pluggyGet(
          `/bills?accountId=${encodeURIComponent(acc.id)}`,
          apiKey,
        ).catch(() => ({ results: [] }));
        const bills = billsResp?.results ?? [];
        for (const bill of bills) {
          await checkedUpsert(admin, "pluggy_bills", {
            bill_id: bill.id,
            account_id: acc.id,
            item_id: itemId,
            user_id: userId,
            due_date: isoDate(bill.dueDate),
            total_amount: toNumber(bill.totalAmount),
            minimum_payment: toNumber(bill.minimumPayment),
            closing_date: isoDate(bill.finalStatementDate ?? bill.closingDate),
            currency_code: bill.currencyCode ?? acc.currencyCode ?? "BRL",
            raw: bill,
            updated_at: nowIso(),
          }, { onConflict: "bill_id" });
          result.bills++;
        }
      } catch (e) {
        await fail(`bills:${acc.id}`, e);
      }
    }

    // ---- Transações da conta (paginado + incremental) ----
    try {
      let from = daysAgo(sinceDays);
      if (incremental) {
        const { data: accRow } = await admin
          .from("pluggy_accounts")
          .select("last_tx_synced_at")
          .eq("account_id", acc.id)
          .maybeSingle();
        const last = accRow?.last_tx_synced_at ? isoDate(accRow.last_tx_synced_at) : null;
        // Reprocessa uma pequena janela para pegar transações pendentes que
        // viraram efetivadas.
        if (last) {
          const d = new Date(last + "T00:00:00");
          d.setDate(d.getDate() - 5);
          from = d.toISOString().slice(0, 10);
        }
      }

      let accTxCount = 0;
      await pluggyListTransactions(apiKey, acc.id, from, async (txs) => {
        const rows = txs.map((t: any) => ({
          tx_id: t.id,
          account_id: acc.id,
          user_id: userId,
          date: isoDate(t.date),
          description: t.description ?? t.descriptionRaw ?? null,
          amount: toNumber(t.amount),
          currency_code: t.currencyCode ?? acc.currencyCode ?? "BRL",
          category: t.category ?? null,
          type: t.type ?? null,
          pending: Boolean(t.status && String(t.status).toUpperCase() === "PENDING"),
          raw: t,
          updated_at: nowIso(),
        }));
        await checkedUpsert(admin, "pluggy_transactions", rows, { onConflict: "tx_id" });
        accTxCount += rows.length;
      });

      result.transactions += accTxCount;
      await admin
        .from("pluggy_accounts")
        .update({ last_tx_synced_at: nowIso() })
        .eq("account_id", acc.id);
    } catch (e) {
      await fail(`transactions:${acc.id}`, e);
    }
  }

  // ---- Remoção de contas órfãs (não vieram mais do banco) ----
  if (accounts.length > 0 && result.errors.every((x) => !x.step.startsWith("accounts"))) {
    try {
      const { data: dbAccounts } = await admin
        .from("pluggy_accounts")
        .select("account_id")
        .eq("item_id", itemId);
      const orphanIds = (dbAccounts ?? [])
        .map((r) => r.account_id)
        .filter((id) => !seenAccountIds.includes(id));
      if (orphanIds.length > 0) {
        await admin.from("pluggy_accounts").delete().in("account_id", orphanIds);
        result.removed += orphanIds.length;
      }
    } catch (e) {
      await fail("accounts:prune", e);
    }
  }

  // ---- Investimentos ----
  try {
    const invResp = await pluggyGet(`/investments?itemId=${encodeURIComponent(itemId)}`, apiKey);
    const investments = invResp.results ?? [];
    const seenInv: string[] = [];
    for (const inv of investments) {
      await checkedUpsert(admin, "pluggy_investments", {
        investment_id: inv.id,
        item_id: itemId,
        user_id: userId,
        name: inv.name ?? null,
        type: inv.type ?? null,
        subtype: inv.subtype ?? null,
        balance: toNumber(inv.balance),
        amount: toNumber(inv.amount),
        currency_code: inv.currencyCode ?? "BRL",
        raw: inv,
        updated_at: nowIso(),
      }, { onConflict: "investment_id" });
      seenInv.push(inv.id);
      result.investments++;
    }
    // prune investimentos órfãos
    const { data: dbInv } = await admin
      .from("pluggy_investments")
      .select("investment_id")
      .eq("item_id", itemId);
    const orphanInv = (dbInv ?? [])
      .map((r) => r.investment_id)
      .filter((id) => !seenInv.includes(id));
    if (orphanInv.length > 0) {
      await admin.from("pluggy_investments").delete().in("investment_id", orphanInv);
      result.removed += orphanInv.length;
    }
    await logSync(admin, { item_id: itemId, user_id: userId, step: "investments", status: "ok", counts: { investments: result.investments } });
  } catch (_e) {
    // Nem todo conector tem produto de investimento — não é erro fatal.
    await logSync(admin, { item_id: itemId, user_id: userId, step: "investments", status: "skip" });
  }

  // ---- Empréstimos / financiamentos ----
  try {
    const loanResp = await pluggyGet(`/loans?itemId=${encodeURIComponent(itemId)}`, apiKey);
    const loans = loanResp.results ?? [];
    const seenLoans: string[] = [];
    for (const loan of loans) {
      await checkedUpsert(admin, "pluggy_loans", {
        loan_id: loan.id,
        item_id: itemId,
        user_id: userId,
        contract_number: loan.contractNumber ?? null,
        product_name: loan.productName ?? loan.name ?? null,
        outstanding_balance: toNumber(loan.balance ?? loan.outstandingBalance),
        installment_amount: toNumber(loan.installmentAmount),
        due_date: isoDate(loan.dueDate ?? loan.nextInstallmentDueDate),
        currency_code: loan.currencyCode ?? "BRL",
        raw: loan,
        updated_at: nowIso(),
      }, { onConflict: "loan_id" });
      seenLoans.push(loan.id);
      result.loans++;
    }
    const { data: dbLoans } = await admin
      .from("pluggy_loans")
      .select("loan_id")
      .eq("item_id", itemId);
    const orphanLoans = (dbLoans ?? [])
      .map((r) => r.loan_id)
      .filter((id) => !seenLoans.includes(id));
    if (orphanLoans.length > 0) {
      await admin.from("pluggy_loans").delete().in("loan_id", orphanLoans);
      result.removed += orphanLoans.length;
    }
    await logSync(admin, { item_id: itemId, user_id: userId, step: "loans", status: "ok", counts: { loans: result.loans } });
  } catch (_e) {
    await logSync(admin, { item_id: itemId, user_id: userId, step: "loans", status: "skip" });
  }

  await finalizeItemLog(admin, itemId, userId, result);
  console.log("[sync] concluído", result);
  return result;
}

async function finalizeItemLog(
  admin: SupabaseClient,
  itemId: string,
  userId: string,
  result: SyncResult,
) {
  await logSync(admin, {
    item_id: itemId,
    user_id: userId,
    step: "done",
    status: result.errors.length ? "error" : "ok",
    counts: {
      accounts: result.accounts,
      cards: result.cards,
      transactions: result.transactions,
      investments: result.investments,
      loans: result.loans,
      bills: result.bills,
      removed: result.removed,
      errors: result.errors.length,
    },
    message: result.errors.length ? result.errors.map((x) => `${x.step}: ${x.message}`).join(" | ") : null,
  });
}
