import type { FinanceState, Transaction, Card } from "./types";

export function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export function convertToBase(state: FinanceState, amount: number, currency: string): number {
  const rates = state.settings.rates;
  const base = state.settings.baseCurrency;
  const from = rates[currency] ?? 1;
  const to = rates[base] ?? 1;
  return (amount * from) / to;
}

export function getTransactionInvoiceMonth(t: Transaction, _cards: Card[]): string {
  if (t.invoiceMonth) return t.invoiceMonth;
  if (!t.cardId) return t.date.slice(0, 7);
  return shiftMonth(t.date.slice(0, 7), 1);
}

export function getInvoiceTransactions(state: FinanceState, month: string): Transaction[] {
  return state.transactions.filter((t) => {
    if (t.ignored) return false;
    if (t.cardId) {
      return getTransactionInvoiceMonth(t, state.cards) === month;
    }
    return t.date.slice(0, 7) === month;
  });
}

export function getMonthTransactions(state: FinanceState, month: string): Transaction[] {
  return state.transactions.filter((t) => !t.ignored && t.date.slice(0, 7) === month);
}

export function monthlyTotals(state: FinanceState, month: string) {
  return getInvoiceTransactions(state, month).reduce(
    (acc, t) => {
      const value = convertToBase(state, t.amount, t.currency);
      if (t.type === "income") acc.income += value;
      else if (t.type === "expense" && !t.cardId) acc.expense += value;
      else if (t.type === "transfer" && t.cardId) acc.expense += value;
      acc.balance = acc.income - acc.expense;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 },
  );
}

export function totalPatrimony(state: FinanceState): number {
  const accounts = state.accounts.reduce((s, a) => s + convertToBase(state, a.balance, a.currency), 0);
  const inv = (state.investments || []).reduce((s, i) => s + convertToBase(state, i.balance, i.currency), 0);
  return accounts + inv;
}

export function cardSpent(state: FinanceState, cardId: string, month: string): number {
  return getInvoiceTransactions(state, month)
    .filter((t) => t.type === "expense" && t.cardId === cardId)
    .reduce((s, t) => s + convertToBase(state, t.amount, t.currency), 0);
}

export function cardPayments(state: FinanceState, cardId: string, month: string): number {
  return getInvoiceTransactions(state, month)
    .filter((t) => t.type === "transfer" && t.cardId === cardId)
    .reduce((s, t) => s + convertToBase(state, t.amount, t.currency), 0);
}

export function cardOutstanding(state: FinanceState, cardId: string, month: string): number {
  return Math.max(0, cardSpent(state, cardId, month) - cardPayments(state, cardId, month));
}

export function categorySpent(state: FinanceState, categoryId: string, month: string): number {
  return getInvoiceTransactions(state, month)
    .filter((t) => t.type === "expense" && t.categoryId === categoryId)
    .reduce((s, t) => s + convertToBase(state, t.amount, t.currency), 0);
}

export function expenseByCategory(state: FinanceState, month: string) {
  const map = new Map<string, { name: string; color: string; total: number }>();
  getMonthTransactions(state, month)
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const cat = state.categories.find((c) => c.id === t.categoryId) || { id: "none", name: "Sem categoria", color: "#65716d" };
      const cur = map.get(cat.id) || { name: cat.name, color: cat.color, total: 0 };
      cur.total += convertToBase(state, t.amount, t.currency);
      map.set(cat.id, cur);
    });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function budgetAlerts(state: FinanceState, month: string) {
  return state.budgets
    .filter((b) => b.month === month)
    .map((b) => {
      const spent = categorySpent(state, b.categoryId, month);
      const percent = b.limit ? (spent / b.limit) * 100 : 0;
      const cat = state.categories.find((c) => c.id === b.categoryId);
      if (percent < 50) return null;
      return {
        percent,
        level: percent >= 100 ? ("danger" as const) : ("warning" as const),
        title: `${cat?.name || "Categoria"} em ${Math.round(percent)}%`,
        message: `${spent.toFixed(2)} de ${b.limit.toFixed(2)}`,
      };
    })
    .filter(Boolean) as Array<{ percent: number; level: "danger" | "warning"; title: string; message: string }>;
}

export function savingsRate(state: FinanceState, month: string): number {
  const t = monthlyTotals(state, month);
  if (!t.income) return 0;
  return Math.round((t.balance / t.income) * 100);
}

export function suggestCategory(state: FinanceState, text: string, type: "income" | "expense" = "expense") {
  const lower = text.toLowerCase();
  const rule = state.rules.find((r) => lower.includes(r.keyword.toLowerCase()));
  if (rule) return { categoryId: rule.categoryId, subcategory: rule.subcategory };
  const cat = state.categories.find((c) => c.type === type);
  return cat ? { categoryId: cat.id, subcategory: cat.subcategories[0] || "" } : null;
}

export function applyTransactionImpact(state: FinanceState, tx: Transaction, direction: 1 | -1) {
  if (tx.date > new Date().toISOString().slice(0, 10)) return;
  const account = state.accounts.find((a) => a.id === tx.accountId);
  if (tx.type === "income" && account) account.balance += tx.amount * direction;
  if (tx.type === "expense" && account && !tx.cardId) account.balance -= tx.amount * direction;
  if (tx.type === "transfer" && account && !tx.cardId) {
    account.balance -= tx.amount * direction;
    if (tx.destAccountId) {
      const dest = state.accounts.find((a) => a.id === tx.destAccountId);
      if (dest) dest.balance += (tx.destAmount || tx.amount) * direction;
    }
  }
}

export function mergeStates(stateA: FinanceState, stateB: FinanceState | null): FinanceState {
  if (!stateB) return stateA;

  const next = JSON.parse(JSON.stringify(stateA)) as FinanceState;

  // 1. Merge Accounts
  const spouseAccounts = (stateB.accounts || []).map((a) => ({
    ...a,
    id: `spouse_${a.id}`,
    name: `${a.name} (Cônjuge)`,
  }));
  next.accounts = [...next.accounts, ...spouseAccounts];

  // 2. Merge Cards
  const spouseCards = (stateB.cards || []).map((c) => ({
    ...c,
    id: `spouse_${c.id}`,
    name: `${c.name} (Cônjuge)`,
  }));
  next.cards = [...next.cards, ...spouseCards];

  // 3. Merge Transactions
  const spouseTransactions = (stateB.transactions || []).map((t) => ({
    ...t,
    id: `spouse_${t.id}`,
    accountId: t.accountId ? `spouse_${t.accountId}` : "",
    cardId: t.cardId ? `spouse_${t.cardId}` : "",
    destAccountId: t.destAccountId ? `spouse_${t.destAccountId}` : undefined,
  }));
  next.transactions = [...next.transactions, ...spouseTransactions].sort((a, b) => b.date.localeCompare(a.date));

  // 4. Merge Recurring Bills
  const spouseRecurring = (stateB.recurringBills || []).map((b) => ({
    ...b,
    id: `spouse_${b.id}`,
  }));
  next.recurringBills = [...(next.recurringBills || []), ...spouseRecurring];

  // 5. Merge Investments
  const spouseInvestments = (stateB.investments || []).map((i) => ({
    ...i,
    id: `spouse_${i.id}`,
    name: `${i.name} (Cônjuge)`,
  }));
  next.investments = [...(next.investments || []), ...spouseInvestments];

  // 6. Merge Goals
  const spouseGoals = (stateB.goals || []).map((g) => ({
    ...g,
    id: `spouse_${g.id}`,
    name: `${g.name} (Cônjuge)`,
  }));
  next.goals = [...(next.goals || []), ...spouseGoals];

  return next;
}

export function lastMonths(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(from, -(count - 1 - i)));
}
