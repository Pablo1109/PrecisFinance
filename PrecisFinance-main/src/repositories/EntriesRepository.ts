import { supabase } from "@/lib/supabase";
import type { FinanceEntry } from "@/types/domain";

function mapRow(r: any): FinanceEntry {
  return {
    id: r.id,
    userId: r.user_id,
    accountId: r.account_id,
    cardId: r.card_id,
    date: r.date,
    postedAt: r.posted_at,
    amount: Number(r.amount),
    currencyCode: r.currency_code,
    direction: r.direction,
    description: r.description,
    merchant: r.merchant,
    categoryId: r.category_id,
    subcategory: r.subcategory,
    tags: r.tags ?? [],
    costCenter: r.cost_center,
    notes: r.notes,
    isInstallment: r.is_installment,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    billId: r.bill_id,
    source: r.source,
    sourceRef: r.source_ref,
    externalHash: r.external_hash,
    reconciledWith: r.reconciled_with,
    confidence: r.confidence,
    raw: r.raw,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const EntriesRepository = {
  async list(params: { from?: string; to?: string; accountId?: string; cardId?: string; limit?: number } = {}) {
    let q = supabase.from("precis_entries").select("*").order("date", { ascending: false });
    if (params.from) q = q.gte("date", params.from);
    if (params.to) q = q.lte("date", params.to);
    if (params.accountId) q = q.eq("account_id", params.accountId);
    if (params.cardId) q = q.eq("card_id", params.cardId);
    if (params.limit) q = q.limit(params.limit);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async createManual(userId: string, e: Omit<FinanceEntry, "id" | "userId" | "createdAt" | "updatedAt" | "source" | "confidence" | "externalHash" | "sourceRef" | "reconciledWith">) {
    const { data, error } = await supabase
      .from("precis_entries")
      .insert({
        user_id: userId,
        account_id: e.accountId,
        card_id: e.cardId,
        date: e.date,
        posted_at: e.postedAt,
        amount: e.amount,
        currency_code: e.currencyCode,
        direction: e.direction,
        description: e.description,
        merchant: e.merchant,
        category_id: e.categoryId,
        subcategory: e.subcategory,
        tags: e.tags,
        cost_center: e.costCenter,
        notes: e.notes,
        is_installment: e.isInstallment,
        installment_number: e.installmentNumber,
        installment_total: e.installmentTotal,
        bill_id: e.billId,
        source: "manual",
        confidence: 100,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async update(id: string, patch: Partial<FinanceEntry>) {
    const { error } = await supabase.from("precis_entries").update(patch as any).eq("id", id);
    if (error) throw error;
  },
};
