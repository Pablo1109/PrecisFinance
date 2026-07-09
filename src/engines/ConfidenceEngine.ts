import type { FieldSource } from "@/types/domain";

/**
 * ConfidenceEngine
 * ----------------
 * Traduz "de onde veio o dado" em um score 0..100. É a base para o Data Resolution Engine
 * decidir qual candidato vence quando o mesmo campo é reportado por várias fontes.
 *
 * Regras baseadas em observação empírica (Pluggy vs realidade):
 *  - Saldo de conta corrente:      confiável (~98%)
 *  - Limite total de cartão:       muito confiável (~95%)
 *  - Fatura atual de cartão:       pouco confiável (~45%) — muitas instituições enviam parcial
 *  - Datas de vencimento/fechamento: ~50% (várias enviam null)
 *  - Investimentos/empréstimos:    ~60%
 *  - Manual: sempre 100 (usuário sabe)
 *  - Calculado a partir de valores confiáveis: 100
 *  - Inferido (heurístico): 70
 */

export interface ConfidenceContext {
  entity: "account" | "card" | "bill" | "transaction" | "loan" | "investment";
  field: string;
}

const OPENFINANCE_BASELINE: Record<string, Record<string, number>> = {
  account: {
    balance: 98,
    display_name: 40,
    number: 95,
  },
  card: {
    credit_limit: 95,
    available_limit: 80,
    used_limit: 60,
    current_bill_amount: 45,
    closed_bill_amount: 60,
    minimum_payment: 55,
    due_day: 50,
    closing_day: 45,
    best_purchase_day: 40,
    next_due_date: 55,
    next_closing_date: 50,
    brand: 90,
    last_four: 95,
  },
  bill: {
    total_amount: 55,
    due_date: 65,
    closing_date: 55,
    minimum_payment: 55,
  },
  transaction: {
    description: 85,
    amount: 98,
    date: 95,
    category: 45,
    merchant: 60,
  },
  loan: { outstanding_balance: 60, installment_amount: 55, due_date: 50 },
  investment: { balance: 70, amount: 65 },
};

export const ConfidenceEngine = {
  /** Confiança padrão de um campo por origem. */
  score(source: FieldSource, ctx: ConfidenceContext): number {
    switch (source) {
      case "manual":
        return 100;
      case "calculated":
        return 100;
      case "imported":
        return 90;
      case "inferred":
        return 70;
      case "openfinance":
        return OPENFINANCE_BASELINE[ctx.entity]?.[ctx.field] ?? 60;
    }
  },
  /** Compara dois valores e devolve o vencedor (maior confiança; empate → mais recente). */
  pickBest<T>(
    a: { value: T | null; source: FieldSource; confidence: number; updatedAt: string } | null,
    b: { value: T | null; source: FieldSource; confidence: number; updatedAt: string } | null,
  ) {
    if (!a) return b;
    if (!b) return a;
    // Valor nulo perde para valor concreto de qualquer confiança > 0.
    if (a.value == null && b.value != null) return b;
    if (b.value == null && a.value != null) return a;
    if (a.confidence !== b.confidence) return a.confidence > b.confidence ? a : b;
    return new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b;
  },
};
