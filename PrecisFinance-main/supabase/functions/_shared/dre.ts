/**
 * Espelho mínimo (Deno) do DataResolutionEngine para uso nas Edge Functions.
 * Mantém a mesma semântica do src/engines/DataResolutionEngine.ts —
 * se um dia unificar em um pacote compartilhado, extraia para /packages/dre.
 */

export type FieldSource = "openfinance" | "calculated" | "manual" | "imported" | "inferred";

const CARD_BASELINE: Record<string, number> = {
  credit_limit: 95, available_limit: 80, used_limit: 60,
  current_bill_amount: 45, closed_bill_amount: 60, minimum_payment: 55,
  due_day: 50, closing_day: 45, best_purchase_day: 40,
  next_due_date: 55, next_closing_date: 50, brand: 90, last_four: 95,
};
const ACCOUNT_BASELINE: Record<string, number> = { balance: 98, display_name: 40, number: 95 };
const TX_BASELINE: Record<string, number> = { description: 85, amount: 98, date: 95, category: 45, merchant: 60 };

export function scoreOf(source: FieldSource, entity: string, field: string): number {
  if (source === "manual" || source === "calculated") return 100;
  if (source === "imported") return 90;
  if (source === "inferred") return 70;
  const t = entity === "card" ? CARD_BASELINE : entity === "account" ? ACCOUNT_BASELINE : entity === "transaction" ? TX_BASELINE : {};
  return t[field] ?? 60;
}
