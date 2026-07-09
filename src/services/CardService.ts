import { DataResolutionEngine } from "@/engines/DataResolutionEngine";
import { CardsRepository, type CardRow } from "@/repositories/CardsRepository";
import { OverridesRepository } from "@/repositories/OverridesRepository";
import type { FieldOverride, ResolvedCard } from "@/types/domain";

/**
 * CardService
 * -----------
 * Camada única que o frontend usa para ler cartões.
 * NUNCA leia pluggy_accounts.credit_data direto na UI — passe por aqui.
 *
 * Fluxo por campo:
 *   candidates = [openfinance (row), calculated (deduzido), manual (override)]
 *   → DRE.resolve → ResolvedField
 */

interface ResolveCardOptions {
  /** Overrides já carregados (opcional, para evitar N+1). */
  overrides?: FieldOverride[];
}

function overrideOf(overrides: FieldOverride[], field: string) {
  return overrides.find((o) => o.field === field) ?? null;
}

function resolveField<T>(
  cardId: string,
  field: string,
  ofValue: T | null | undefined,
  calc: { value: T | null; note: string } | null,
  overrides: FieldOverride[],
  updatedAt: string,
) {
  const cands = [];
  const of = DataResolutionEngine.candidateOf(ofValue as T, "openfinance", { updatedAt });
  if (of) cands.push(of);
  if (calc) {
    const cc = DataResolutionEngine.candidateOf(calc.value, "calculated", { note: calc.note });
    if (cc) cands.push(cc);
  }
  const ov = overrideOf(overrides, field);
  if (ov) {
    const oc = DataResolutionEngine.candidateOf(ov.value as T, ov.source, {
      updatedAt: ov.updatedAt,
      confidence: ov.confidence,
      note: ov.reason ?? "manual_override",
    });
    if (oc) cands.push(oc);
  }
  return DataResolutionEngine.resolve<T>({ entity: "card", field }, cands);
  void cardId;
}

function resolveCard(row: CardRow, overrides: FieldOverride[]): ResolvedCard {
  const upd = row.updated_at;
  // Calculado: usado = total - disponível (quando ambos existem)
  const calcUsed =
    row.credit_limit != null && row.available_limit != null
      ? { value: Number((row.credit_limit - row.available_limit).toFixed(2)), note: "credit_limit - available_limit" }
      : null;
  // Calculado: disponível = total - usado (fallback simétrico)
  const calcAvailable =
    row.credit_limit != null && row.used_limit != null && row.available_limit == null
      ? { value: Number((row.credit_limit - row.used_limit).toFixed(2)), note: "credit_limit - used_limit" }
      : null;

  return {
    cardId: row.card_id,
    itemId: row.item_id,
    displayName:        resolveField<string>(row.card_id, "display_name",        row.display_name,        null,          overrides, upd),
    brand:              resolveField<string>(row.card_id, "brand",               row.brand,               null,          overrides, upd),
    lastFour:           resolveField<string>(row.card_id, "last_four",           row.last_four,           null,          overrides, upd),
    creditLimit:        resolveField<number>(row.card_id, "credit_limit",        row.credit_limit,        null,          overrides, upd),
    availableLimit:     resolveField<number>(row.card_id, "available_limit",     row.available_limit,     calcAvailable, overrides, upd),
    usedLimit:          resolveField<number>(row.card_id, "used_limit",          row.used_limit,          calcUsed,      overrides, upd),
    currentBillAmount:  resolveField<number>(row.card_id, "current_bill_amount", row.current_bill_amount, null,          overrides, upd),
    closedBillAmount:   resolveField<number>(row.card_id, "closed_bill_amount",  row.closed_bill_amount,  null,          overrides, upd),
    minimumPayment:     resolveField<number>(row.card_id, "minimum_payment",     row.minimum_payment,     null,          overrides, upd),
    dueDay:             resolveField<number>(row.card_id, "due_day",             row.due_day,             null,          overrides, upd),
    closingDay:         resolveField<number>(row.card_id, "closing_day",         row.closing_day,         null,          overrides, upd),
    bestPurchaseDay:    resolveField<number>(row.card_id, "best_purchase_day",   row.best_purchase_day,   null,          overrides, upd),
    nextDueDate:        resolveField<string>(row.card_id, "next_due_date",       row.next_due_date,       null,          overrides, upd),
    nextClosingDate:    resolveField<string>(row.card_id, "next_closing_date",   row.next_closing_date,   null,          overrides, upd),
    futureInstallments: resolveField<number>(row.card_id, "future_installments", row.future_installments, null,          overrides, upd),
    currentInstallments:resolveField<number>(row.card_id, "current_installments",row.current_installments,null,          overrides, upd),
    currencyCode: row.currency_code,
    updatedAt: upd,
  };
}

export const CardService = {
  async listResolved(): Promise<ResolvedCard[]> {
    const rows = await CardsRepository.listAll();
    // Carrega overrides em lote (uma query por cartão — evolua para IN quando >30)
    return Promise.all(
      rows.map(async (row) => {
        const ov = await OverridesRepository.listForEntity("card", row.card_id);
        return resolveCard(row, ov);
      }),
    );
  },
  async getResolved(cardId: string, opts: ResolveCardOptions = {}): Promise<ResolvedCard | null> {
    const row = await CardsRepository.getById(cardId);
    if (!row) return null;
    const overrides = opts.overrides ?? (await OverridesRepository.listForEntity("card", cardId));
    return resolveCard(row, overrides);
  },
  /** Aplica override manual em um campo do cartão. */
  async setOverride(userId: string, cardId: string, field: string, value: unknown, reason?: string) {
    await OverridesRepository.upsert(userId, {
      entity: "card",
      entityId: cardId,
      field,
      value,
      source: "manual",
      confidence: 100,
      reason,
    });
  },
  async clearOverride(userId: string, cardId: string, field: string) {
    await OverridesRepository.remove(userId, { entity: "card", entityId: cardId, field });
  },
};
