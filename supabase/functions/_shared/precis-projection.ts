// deno-lint-ignore-file no-explicit-any
/**
 * Motor de projeção Precis — transforma dados Pluggy em precis_cards / precis_entries.
 * Respeita overrides manuais, classifica lançamentos e sugere conciliação.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { classify, type KeywordRule, type LearnedRule } from "./classification.ts";
import { canAutoMerge, findRecoCandidates } from "./reconciliation-match.ts";
import { txHash } from "./reconciliation.ts";

export const CARD_FIELDS = [
  "display_name", "brand", "last_four", "credit_limit", "available_limit", "used_limit",
  "current_bill_amount", "closed_bill_amount", "minimum_payment", "due_day", "closing_day",
  "best_purchase_day", "next_due_date", "next_closing_date",
] as const;

export type CardField = typeof CARD_FIELDS[number];

export interface ProjectionCounts {
  accounts: number;
  cards: number;
  transactions: number;
  entries_upserted: number;
  entries_merged: number;
  review_items: number;
}

export interface ProjectionContext {
  userId: string;
  itemId: string;
  runId: string;
  apiKey: string;
  counts: ProjectionCounts;
}

type OverrideRow = { entity_id: string; field: string; value: unknown };

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dayFromDate(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getDate()) ? d.getDate() : null;
}

function bestDay(closingDay: number): number {
  return (closingDay % 31) + 1;
}

function jsonVal(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "value" in (v as object)) return (v as { value: unknown }).value;
  return v;
}

function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) > 0.01;
  return String(a) !== String(b);
}

export async function loadOverridesForEntity(
  admin: SupabaseClient,
  userId: string,
  entity: string,
  entityIds: string[],
): Promise<Map<string, Map<string, unknown>>> {
  const map = new Map<string, Map<string, unknown>>();
  if (entityIds.length === 0) return map;

  const { data } = await admin
    .from("precis_field_overrides")
    .select("entity_id, field, value")
    .eq("user_id", userId)
    .eq("entity", entity)
    .in("entity_id", entityIds);

  for (const row of (data ?? []) as OverrideRow[]) {
    if (!map.has(row.entity_id)) map.set(row.entity_id, new Map());
    map.get(row.entity_id)!.set(row.field, jsonVal(row.value));
  }
  return map;
}

export function buildCardFromPluggy(acc: any, userId: string, itemId: string) {
  const cd = acc.creditData ?? {};
  const creditLimit = num(cd.creditLimit);
  const available = num(cd.availableCreditLimit);
  const used = creditLimit != null && available != null
    ? +(creditLimit - available).toFixed(2)
    : num(cd.disbursedAmount);

  let currentBill = num(cd.balance) ?? num(cd.balanceForeignCurrency);
  // Heurística: Nubank/MP frequentemente retornam fatura = limite utilizado
  if (currentBill != null && used != null && Math.abs(currentBill - used) < 0.02) {
    currentBill = null;
  }

  const closingDate = cd.balanceCloseDate ?? cd.closingDate ?? null;
  const dueDate = cd.balanceDueDate ?? cd.dueDate ?? null;

  return {
    card_id: acc.id,
    user_id: userId,
    item_id: itemId,
    display_name: acc.marketingName ?? acc.name,
    brand: cd.brand ?? cd.cardBrand ?? null,
    last_four: acc.number ? String(acc.number).slice(-4) : null,
    credit_limit: creditLimit,
    available_limit: available,
    used_limit: used,
    current_bill_amount: currentBill,
    closed_bill_amount: num(cd.lastClosedBill) ?? num(cd.closedBalance) ?? null,
    minimum_payment: num(cd.minimumPayment),
    due_day: dayFromDate(dueDate),
    closing_day: dayFromDate(closingDate),
    best_purchase_day: dayFromDate(closingDate) ? bestDay(dayFromDate(closingDate)!) : null,
    next_due_date: dueDate,
    next_closing_date: closingDate,
    currency_code: acc.currencyCode ?? "BRL",
    updated_at: new Date().toISOString(),
  };
}

export async function upsertCardRespectingOverrides(
  admin: SupabaseClient,
  ctx: ProjectionContext,
  acc: any,
  overridesByCard: Map<string, Map<string, unknown>>,
) {
  if (acc.type !== "CREDIT") return;

  const ofRow = buildCardFromPluggy(acc, ctx.userId, ctx.itemId);
  const cardId = acc.id as string;
  const overridden = overridesByCard.get(cardId) ?? new Map<string, unknown>();

  const { data: existing } = await admin
    .from("precis_cards")
    .select("*")
    .eq("card_id", cardId)
    .maybeSingle();

  const toUpsert: Record<string, unknown> = { ...ofRow };
  for (const field of overridden.keys()) {
    if (existing && field in existing) toUpsert[field] = (existing as any)[field];
  }

  await admin.from("precis_cards").upsert(toUpsert);

  for (const [field, manualVal] of overridden) {
    const ofVal = (ofRow as any)[field];
    if (ofVal != null && valuesDiffer(ofVal, manualVal)) {
      await admin.from("precis_review_queue").insert({
        user_id: ctx.userId,
        sync_run_id: ctx.runId,
        kind: "conflict",
        entity: "card",
        entity_id: cardId,
        payload: { field, openfinance: ofVal, manual: manualVal },
      });
      ctx.counts.review_items++;
    }
  }

  ctx.counts.cards++;

  const missing = {
    dueDate: !ofRow.next_due_date && !overridden.has("due_day") && !overridden.has("next_due_date"),
    closingDate: !ofRow.next_closing_date && !overridden.has("closing_day") && !overridden.has("next_closing_date"),
    creditLimit: ofRow.credit_limit == null && !overridden.has("credit_limit"),
    currentBill: ofRow.current_bill_amount == null && !overridden.has("current_bill_amount"),
  };
  if (missing.dueDate || missing.closingDate || missing.creditLimit || missing.currentBill) {
    await admin.from("precis_review_queue").insert({
      user_id: ctx.userId,
      sync_run_id: ctx.runId,
      kind: "card_incomplete",
      entity: "card",
      entity_id: cardId,
      payload: { missing },
    });
    ctx.counts.review_items++;
  }
}

async function loadClassificationContext(admin: SupabaseClient, userId: string) {
  const [{ data: learned }, { data: keywords }] = await Promise.all([
    admin.from("precis_learned_categories").select("signature, category_id, subcategory, weight").eq("user_id", userId),
    admin.from("pluggy_category_rules").select("pattern, category_id, subcategory").eq("user_id", userId),
  ]);
  return {
    learned: (learned ?? []) as LearnedRule[],
    keywordRules: (keywords ?? []).map((r: any) => ({
      pattern: r.pattern,
      categoryId: r.category_id,
      subcategory: r.subcategory,
    })) as KeywordRule[],
  };
}

async function loadManualEntriesNear(
  admin: SupabaseClient,
  userId: string,
  accountOrCardId: string,
  date: string,
) {
  const from = new Date(date);
  from.setDate(from.getDate() - 3);
  const to = new Date(date);
  to.setDate(to.getDate() + 3);
  const { data } = await admin
    .from("precis_entries")
    .select("id, account_id, card_id, date, amount, direction, description, source, reconciled_with")
    .eq("user_id", userId)
    .eq("source", "manual")
    .is("reconciled_with", null)
    .gte("date", from.toISOString().slice(0, 10))
    .lte("date", to.toISOString().slice(0, 10))
    .or(`account_id.eq.${accountOrCardId},card_id.eq.${accountOrCardId}`);
  return data ?? [];
}

export async function upsertEntryFromTransaction(
  admin: SupabaseClient,
  ctx: ProjectionContext,
  acc: any,
  tx: any,
  classCtx: { learned: LearnedRule[]; keywordRules: KeywordRule[] },
) {
  ctx.counts.transactions++;

  await admin.from("pluggy_transactions").upsert({
    tx_id: tx.id,
    account_id: acc.id,
    user_id: ctx.userId,
    date: tx.date?.slice(0, 10) ?? null,
    description: tx.description,
    amount: tx.amount,
    currency_code: tx.currencyCode,
    category: tx.category,
    type: tx.type,
    raw: tx,
  });

  const direction: "debit" | "credit" = tx.amount < 0 || tx.type === "DEBIT" ? "debit" : "credit";
  const absAmount = Math.abs(Number(tx.amount) || 0);
  const dateStr = tx.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const hash = await txHash({
    accountId: acc.id,
    date: dateStr,
    amount: absAmount,
    description: tx.description ?? "",
    sourceRef: tx.id,
  });

  const merchant = tx.merchant?.name ?? tx.merchant ?? null;
  const classification = classify(
    { description: tx.description ?? "", merchant, pluggyCategory: tx.category },
    classCtx,
  );

  const { data: existing } = await admin
    .from("precis_entries")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("external_hash", hash)
    .maybeSingle();

  const ofPayload: Record<string, unknown> = {
    user_id: ctx.userId,
    account_id: acc.type === "BANK" ? acc.id : null,
    card_id: acc.type === "CREDIT" ? acc.id : null,
    date: dateStr,
    posted_at: tx.date ?? null,
    amount: absAmount,
    currency_code: tx.currencyCode ?? "BRL",
    direction,
    description: tx.description ?? "(sem descrição)",
    merchant,
    category_id: classification.categoryId,
    subcategory: classification.subcategory,
    tags: [],
    source: "openfinance",
    source_ref: tx.id,
    external_hash: hash,
    confidence: classification.confidence,
    raw: tx,
    reviewed: existing ? (existing.reviewed ?? true) : false,
    ignored: existing ? (existing.ignored ?? false) : false,
    updated_at: new Date().toISOString(),
  };

  const txOverrides = await loadOverridesForEntity(admin, ctx.userId, "transaction", [tx.id]);
  const fieldOv = txOverrides.get(tx.id) ?? new Map<string, unknown>();

  const entryFieldMap: Record<string, string> = {
    description: "description",
    category_id: "category_id",
    subcategory: "subcategory",
    amount: "amount",
    merchant: "merchant",
    notes: "notes",
  };

  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (existing.source === "manual") {
      await admin.from("precis_review_queue").insert({
        user_id: ctx.userId,
        sync_run_id: ctx.runId,
        kind: "conflict",
        entity: "transaction",
        entity_id: existing.id,
        payload: { reason: "manual_entry_same_hash", hash },
      });
      ctx.counts.review_items++;
      return;
    }

    const { data: entryOvRows } = await admin
      .from("precis_field_overrides")
      .select("field")
      .eq("user_id", ctx.userId)
      .eq("entity", "transaction")
      .eq("entity_id", existing.id);
    const entryOvFields = new Set((entryOvRows ?? []).map((r: { field: string }) => r.field));

    for (const [col, val] of Object.entries(ofPayload)) {
      if (["user_id", "external_hash", "source", "source_ref"].includes(col)) continue;
      const ovField = entryFieldMap[col] ?? col;
      if (fieldOv.has(ovField) || entryOvFields.has(ovField)) continue;
      patch[col] = val;
    }
    await admin.from("precis_entries").update(patch).eq("id", existing.id);
    ctx.counts.entries_upserted++;
    return;
  }

  const manualNear = await loadManualEntriesNear(admin, ctx.userId, acc.id, dateStr);
  const candidates = findRecoCandidates(
    { accountId: acc.id, cardId: acc.type === "CREDIT" ? acc.id : null, date: dateStr, amount: absAmount, description: tx.description ?? "", direction },
    manualNear.map((e: any) => ({
      id: e.id,
      accountId: e.account_id,
      cardId: e.card_id,
      date: e.date,
      amount: Number(e.amount),
      direction: e.direction,
      description: e.description,
      source: e.source,
    })),
  );

  const top = candidates[0];
  if (top && canAutoMerge(top)) {
    await admin.from("precis_entries").update({
      source_ref: tx.id,
      external_hash: hash,
      reconciled_with: null,
      confidence: Math.max(Number(manualNear.find((e: any) => e.id === top.entryId)?.confidence ?? 100), classification.confidence),
      updated_at: new Date().toISOString(),
    }).eq("id", top.entryId);
    ctx.counts.entries_merged++;
    return;
  }

  if (top && top.score >= 70) {
    await admin.from("precis_review_queue").insert({
      user_id: ctx.userId,
      sync_run_id: ctx.runId,
      kind: "reconcile_candidate",
      entity: "transaction",
      entity_id: tx.id,
      payload: {
        manualEntryId: top.entryId,
        score: top.score,
        reason: top.reason,
        openfinance: { description: tx.description, amount: absAmount, date: dateStr },
      },
    });
    ctx.counts.review_items++;
  }

  await admin.from("precis_entries").upsert(ofPayload, { onConflict: "user_id,external_hash" });
  ctx.counts.entries_upserted++;
}

export async function pluggyFetch<T>(path: string, apiKey: string): Promise<T> {
  const r = await fetch(`https://api.pluggy.ai${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`pluggy ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function projectItemToPrecis(
  admin: SupabaseClient,
  ctx: ProjectionContext,
): Promise<ProjectionCounts> {
  const classCtx = await loadClassificationContext(admin, ctx.userId);

  const accountsRes = await pluggyFetch<{ results: any[] }>(
    `/accounts?itemId=${encodeURIComponent(ctx.itemId)}`,
    ctx.apiKey,
  );

  const creditIds = accountsRes.results.filter((a) => a.type === "CREDIT").map((a) => a.id);
  const overridesByCard = await loadOverridesForEntity(admin, ctx.userId, "card", creditIds);

  for (const acc of accountsRes.results) {
    await admin.from("pluggy_accounts").upsert({
      account_id: acc.id,
      item_id: ctx.itemId,
      user_id: ctx.userId,
      type: acc.type,
      subtype: acc.subtype,
      name: acc.name,
      number: acc.number,
      marketing_name: acc.marketingName,
      balance: acc.balance,
      currency_code: acc.currencyCode,
      credit_data: acc.creditData ?? null,
      raw: acc,
      updated_at: new Date().toISOString(),
    });
    ctx.counts.accounts++;

    if (acc.type === "CREDIT") {
      await upsertCardRespectingOverrides(admin, ctx, acc, overridesByCard);
    }

    const { data: accRow } = await admin
      .from("pluggy_accounts")
      .select("last_tx_synced_at")
      .eq("account_id", acc.id)
      .maybeSingle();

    let since = "2024-01-01";
    if (accRow?.last_tx_synced_at) {
      const d = new Date(accRow.last_tx_synced_at);
      d.setDate(d.getDate() - 5);
      since = d.toISOString().slice(0, 10);
    }

    // /v2/transactions — paginação por cursor (legado /transactions depreciado)
    let txPath =
      `/v2/transactions?accountId=${encodeURIComponent(acc.id)}&dateFrom=${encodeURIComponent(since)}`;
    let txGuard = 0;
    while (txPath && txGuard < 200) {
      txGuard++;
      const txRes = await pluggyFetch<{ results?: any[]; next?: string | null }>(txPath, ctx.apiKey);
      for (const tx of txRes.results ?? []) {
        await upsertEntryFromTransaction(admin, ctx, acc, tx, classCtx);
      }
      const next = txRes.next;
      if (!next) break;
      txPath = next.startsWith("/")
        ? next
        : `/v2/transactions${next.startsWith("?") ? next : `?${next}`}`;
    }

    await admin
      .from("pluggy_accounts")
      .update({ last_tx_synced_at: new Date().toISOString() })
      .eq("account_id", acc.id);
  }

  // 4. Fetch and project Open Finance investments
  try {
    const invRes = await pluggyFetch<{ results: any[] }>(
      `/investments?itemId=${encodeURIComponent(ctx.itemId)}`,
      ctx.apiKey,
    );
    const fetchedIds = (invRes.results ?? []).map((inv) => inv.id);
    const { data: existingInv } = await admin
      .from("pluggy_investments")
      .select("investment_id")
      .eq("item_id", ctx.itemId);
    
    const existingIds = (existingInv ?? []).map((x: any) => x.investment_id);
    const orphanInv = existingIds.filter((id) => !fetchedIds.includes(id));
    if (orphanInv.length > 0) {
      await admin.from("pluggy_investments").delete().in("investment_id", orphanInv);
    }

    for (const inv of invRes.results ?? []) {
      await admin.from("pluggy_investments").upsert({
        investment_id: inv.id,
        item_id: ctx.itemId,
        user_id: ctx.userId,
        type: inv.type,
        subtype: inv.subtype,
        name: inv.name,
        number: inv.number,
        balance: Number(inv.balance || 0),
        currency_code: inv.currencyCode || "BRL",
        raw: inv,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Erro ao sincronizar investimentos do Pluggy:", err);
  }

  return ctx.counts;
}

export function emptyCounts(): ProjectionCounts {
  return { accounts: 0, cards: 0, transactions: 0, entries_upserted: 0, entries_merged: 0, review_items: 0 };
}
