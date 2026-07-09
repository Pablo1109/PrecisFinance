// deno-lint-ignore-file no-explicit-any
/**
 * pluggy-sync (v2) — Edge Function
 * --------------------------------
 * Sincroniza UM item Pluggy e projeta os dados no modelo Precis:
 *   pluggy_accounts (crédito) → precis_cards
 *   pluggy_transactions       → precis_entries (com hash determinístico)
 *
 * Preserva overrides do usuário: nunca sobrescreve valores em precis_field_overrides.
 * Cria linhas em precis_review_queue para cartões com dados incompletos.
 *
 * Chame com POST { item_id: string }.
 * Autenticação: bearer do usuário (RLS via anon fica opcional; escrita usa service_role).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { txHash } from "../_shared/reconciliation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLUGGY_ID    = Deno.env.get("PLUGGY_CLIENT_ID")!;
const PLUGGY_SECRET= Deno.env.get("PLUGGY_CLIENT_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function pluggyApiKey(): Promise<string> {
  const r = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: PLUGGY_ID, clientSecret: PLUGGY_SECRET }),
  });
  if (!r.ok) throw new Error(`pluggy auth ${r.status}`);
  const j = await r.json();
  return j.apiKey as string;
}

async function pluggy<T>(path: string, apiKey: string): Promise<T> {
  const r = await fetch(`https://api.pluggy.ai${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`pluggy ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json",
  };
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!auth) return null;
  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${auth}` } },
  });
  const { data } = await anon.auth.getUser();
  return data.user?.id ?? null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method" }), { status: 405, headers: cors });

  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });

    const { item_id } = await req.json();
    if (!item_id) throw new Error("missing item_id");

    // 1. Abre sync run
    const { data: run, error: runErr } = await admin
      .from("precis_sync_runs")
      .insert({ user_id: userId, item_id, scope: "item", status: "running", counts: {} })
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = run.id as string;

    const counts: Record<string, number> = { accounts: 0, cards: 0, transactions: 0, entries_upserted: 0, review_items: 0 };

    const apiKey = await pluggyApiKey();

    // 2. Contas
    const accountsRes = await pluggy<{ results: any[] }>(`/accounts?itemId=${item_id}`, apiKey);
    for (const acc of accountsRes.results) {
      // upsert base
      await admin.from("pluggy_accounts").upsert({
        account_id: acc.id, item_id, user_id: userId,
        type: acc.type, subtype: acc.subtype, name: acc.name, number: acc.number,
        marketing_name: acc.marketingName, balance: acc.balance, currency_code: acc.currencyCode,
        credit_data: acc.creditData ?? null, raw: acc,
      });
      counts.accounts++;

      // Projeção em precis_cards
      if (acc.type === "CREDIT") {
        const cd = acc.creditData ?? {};
        const creditLimit  = num(cd.creditLimit);
        const available    = num(cd.availableCreditLimit);
        const used         = creditLimit != null && available != null ? +(creditLimit - available).toFixed(2) : num(cd.balanceCloseDate);
        const closingDate  = cd.balanceCloseDate ?? null;   // fechamento próxima fatura (nome do Pluggy varia)
        const dueDate      = cd.balanceDueDate ?? null;
        await admin.from("precis_cards").upsert({
          card_id: acc.id, user_id: userId, item_id,
          display_name: acc.marketingName ?? acc.name,
          brand: cd.brand ?? null,
          last_four: acc.number ? String(acc.number).slice(-4) : null,
          credit_limit: creditLimit,
          available_limit: available,
          used_limit: used,
          current_bill_amount: num(cd.balanceForeignCurrency) ?? num(cd.balance),
          closed_bill_amount: num(cd.minimumPayment) != null ? num(cd.balance) : null,
          minimum_payment: num(cd.minimumPayment),
          due_day: dayFromDate(dueDate),
          closing_day: dayFromDate(closingDate),
          best_purchase_day: dayFromDate(closingDate) ? bestDay(dayFromDate(closingDate)!) : null,
          next_due_date: dueDate,
          next_closing_date: closingDate,
          currency_code: acc.currencyCode ?? "BRL",
        });
        counts.cards++;

        // Marca para revisão se faltam datas críticas
        if (!dueDate || !closingDate || creditLimit == null) {
          await admin.from("precis_review_queue").insert({
            user_id: userId, sync_run_id: runId, kind: "card_incomplete",
            entity: "card", entity_id: acc.id,
            payload: { missing: { dueDate: !dueDate, closingDate: !closingDate, creditLimit: creditLimit == null } },
          });
          counts.review_items++;
        }
      }

      // 3. Transações (incremental via last_tx_synced_at)
      const { data: accRow } = await admin.from("pluggy_accounts").select("last_tx_synced_at").eq("account_id", acc.id).maybeSingle();
      const since = accRow?.last_tx_synced_at ? new Date(accRow.last_tx_synced_at).toISOString().slice(0, 10) : "2024-01-01";
      const txRes = await pluggy<{ results: any[] }>(`/transactions?accountId=${acc.id}&from=${since}&pageSize=500`, apiKey);

      for (const tx of txRes.results) {
        counts.transactions++;
        // upsert tabela raw
        await admin.from("pluggy_transactions").upsert({
          tx_id: tx.id, account_id: acc.id, user_id: userId,
          date: tx.date?.slice(0, 10) ?? null, description: tx.description, amount: tx.amount,
          currency_code: tx.currencyCode, category: tx.category, type: tx.type, raw: tx,
        });

        // Projeção em precis_entries com hash determinístico
        const direction: "debit" | "credit" = tx.amount < 0 || tx.type === "DEBIT" ? "debit" : "credit";
        const absAmount = Math.abs(Number(tx.amount) || 0);
        const dateStr = tx.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
        const hash = await txHash({ accountId: acc.id, date: dateStr, amount: absAmount, description: tx.description ?? "", sourceRef: tx.id });

        await admin.from("precis_entries").upsert(
          {
            user_id: userId,
            account_id: acc.type === "BANK" ? acc.id : null,
            card_id: acc.type === "CREDIT" ? acc.id : null,
            date: dateStr,
            posted_at: tx.date ?? null,
            amount: absAmount,
            currency_code: tx.currencyCode ?? "BRL",
            direction,
            description: tx.description ?? "(sem descrição)",
            merchant: tx.merchant?.name ?? null,
            category_id: tx.category ?? null,
            tags: [],
            source: "openfinance",
            source_ref: tx.id,
            external_hash: hash,
            confidence: 90,
            raw: tx,
          },
          { onConflict: "user_id,external_hash", ignoreDuplicates: false },
        );
        counts.entries_upserted++;
      }

      await admin.from("pluggy_accounts").update({ last_tx_synced_at: new Date().toISOString() }).eq("account_id", acc.id);
    }

    await admin.from("precis_sync_runs").update({
      status: "ok", finished_at: new Date().toISOString(), counts,
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, counts }), { headers: cors });
  } catch (e) {
    console.error("[pluggy-sync]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});

function num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function dayFromDate(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getDate()) ? d.getDate() : null;
}
function bestDay(closingDay: number): number { return ((closingDay % 31) + 1); }
