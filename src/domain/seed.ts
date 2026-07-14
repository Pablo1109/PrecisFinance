import type { FinanceState } from "./types";
import { currentMonth, shiftMonth } from "./finance";

export function defaultCategories() {
  return [
    { id: "cat_salary", type: "income" as const, name: "Salário", subcategories: ["CLT", "Pro labore"], color: "#26966f" },
    { id: "cat_extra", type: "income" as const, name: "Renda extra", subcategories: ["Freelance", "Venda"], color: "#4267b2" },
    { id: "cat_home", type: "expense" as const, name: "Moradia", subcategories: ["Aluguel", "Condomínio"], color: "#176b5b" },
    { id: "cat_food", type: "expense" as const, name: "Alimentação", subcategories: ["Supermercado", "Restaurante"], color: "#f27d72" },
    { id: "cat_transport", type: "expense" as const, name: "Transporte", subcategories: ["Combustível", "Apps"], color: "#4267b2" },
    { id: "cat_health", type: "expense" as const, name: "Saúde", subcategories: ["Farmácia", "Consultas"], color: "#7d5ab6" },
    { id: "cat_leisure", type: "expense" as const, name: "Lazer", subcategories: ["Cinema", "Viagens"], color: "#f0b84e" },
    { id: "cat_subs", type: "expense" as const, name: "Assinaturas", subcategories: ["Streaming", "Software"], color: "#c35f4d" },
    { id: "cat_cards", type: "expense" as const, name: "Cartões", subcategories: ["Fatura", "Tarifas"], color: "#5c7485" },
    { id: "cat_openfinance", type: "expense" as const, name: "Open Finance", subcategories: ["Banco", "Cartão"], color: "#4267b2" },
    { id: "cat_transfer", type: "expense" as const, name: "Transferência", subcategories: ["Entre minhas contas", "PIX"], color: "#64748b" },
    { id: "cat_investment", type: "expense" as const, name: "Investimento", subcategories: ["Caixinha", "CDB", "Renda Fixa"], color: "#0ea5e9" },
    { id: "cat_fixed_rent", type: "fixed" as const, name: "Aluguel / Condomínio", subcategories: ["Habitação"], color: "#176b5b" },
    { id: "cat_fixed_internet", type: "fixed" as const, name: "Internet / Telefone", subcategories: ["Comunicação"], color: "#4267b2" },
    { id: "cat_fixed_energy", type: "fixed" as const, name: "Luz / Água", subcategories: ["Utilidades"], color: "#f0b84e" },
    { id: "cat_fixed_streaming", type: "fixed" as const, name: "Assinaturas Fixas", subcategories: ["Serviços"], color: "#c35f4d" },
  ];
}

export function createEmptyState(): FinanceState {
  return {
    schemaVersion: 1,
    settings: {
      selectedMonth: currentMonth(),
      baseCurrency: "BRL",
      rates: { BRL: 1, USD: 5.45, EUR: 5.9, GBP: 6.92 },
      autoCategorization: true,
    },
    accounts: [],
    cards: [],
    categories: defaultCategories(),
    transactions: [],
    budgets: [],
    goals: [],
    rules: [],
    investments: [],
    loans: [],
    recurringBills: [],
  };
}

export function normalizeState(value: Partial<FinanceState> | null | undefined): FinanceState {
  const seed = createEmptyState();
  if (!value) return seed;
  return {
    ...seed,
    ...value,
    settings: { ...seed.settings, ...(value.settings || {}) },
    accounts: value.accounts ?? seed.accounts,
    cards: (value.cards ?? seed.cards).map((c) => ({ ...c, accountId: c.accountId ?? "", autoPay: c.autoPay ?? false })),
    categories: value.categories ?? seed.categories,
    transactions: value.transactions ?? seed.transactions,
    budgets: value.budgets ?? seed.budgets,
    goals: value.goals ?? seed.goals,
    rules: value.rules ?? seed.rules,
    investments: value.investments ?? [],
    loans: value.loans ?? [],
    recurringBills: value.recurringBills ?? [],
    schemaVersion: 1,
  };
}

export function createDemoState(): FinanceState {
  const month = currentMonth();
  const last = shiftMonth(month, -1);
  const d = (m: string, day: number) => `${m}-${String(day).padStart(2, "0")}`;
  const state = createEmptyState();
  state.accounts = [
    { id: "acc_main", name: "Conta principal", type: "Conta corrente", currency: "BRL", balance: 8420.45, color: "#176b5b" },
    { id: "acc_savings", name: "Reserva", type: "Poupança", currency: "BRL", balance: 18500, color: "#4267b2" },
  ];
  state.cards = [
    { id: "card_black", name: "Black final 1020", brand: "Mastercard", limit: 9800, closingDay: 18, dueDay: 26, color: "#13201c", accountId: "acc_main", autoPay: true },
  ];
  state.transactions = [
    { id: "tx_1", type: "income", date: d(month, 5), description: "Salário", amount: 8300, currency: "BRL", accountId: "acc_main", cardId: "", categoryId: "cat_salary", subcategory: "CLT", tags: "", location: "", note: "", recurring: true, createdAt: new Date().toISOString() },
    { id: "tx_2", type: "expense", date: d(month, 8), description: "Supermercado", amount: 486.72, currency: "BRL", accountId: "acc_main", cardId: "", categoryId: "cat_food", subcategory: "Supermercado", tags: "mercado", location: "", note: "", recurring: false, createdAt: new Date().toISOString() },
    { id: "tx_3", type: "expense", date: d(last, 14), description: "Viagem", amount: 680, currency: "BRL", accountId: "", cardId: "card_black", categoryId: "cat_leisure", subcategory: "Viagens", tags: "", location: "", note: "", recurring: false, createdAt: new Date().toISOString() },
  ];
  state.budgets = [{ id: "bud_food", month, categoryId: "cat_food", limit: 1200 }];
  state.goals = [{ id: "goal_em", name: "Reserva de emergência", target: 30000, saved: 18500, deadline: `${new Date().getFullYear()}-12-20`, currency: "BRL", color: "#176b5b" }];
  state.rules = [{ id: "r1", keyword: "ifood", categoryId: "cat_food", subcategory: "Restaurante" }];
  return state;
}
