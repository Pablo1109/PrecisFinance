export type TxType = "income" | "expense" | "transfer";

export interface FinanceSettings {
  selectedMonth: string;
  baseCurrency: string;
  rates: Record<string, number>;
  autoCategorization: boolean;
  spouseId?: string;
  userName?: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  color: string;
  source?: "pluggy" | "manual";
  pluggyAccountId?: string;
  pluggyItemId?: string;
  userName?: string;
}

export interface Card {
  id: string;
  name: string;
  brand: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  accountId: string;
  autoPay: boolean;
  source?: "pluggy" | "manual";
  userEdited?: boolean;
  pluggyAccountId?: string;
  invoiceAmount?: number;
  userName?: string;
}

export interface Category {
  id: string;
  type: "income" | "expense" | "fixed";
  name: string;
  subcategories: string[];
  color: string;
}

export interface Transaction {
  id: string;
  type: TxType;
  date: string;
  description: string;
  amount: number;
  currency: string;
  accountId: string;
  cardId: string;
  categoryId: string;
  subcategory: string;
  tags: string;
  location: string;
  note: string;
  recurring: boolean;
  parentRecurringId?: string;
  destAccountId?: string;
  destAmount?: number;
  installmentGroupId?: string;
  installmentIndex?: number;
  installmentTotal?: number;
  invoiceMonth?: string;
  autoPayment?: boolean;
  source?: "pluggy" | "manual";
  pluggyTransactionId?: string;
  userClassified?: boolean;
  reviewed?: boolean;
  ignored?: boolean;
  createdAt: string;
  updatedAt?: string;
  userName?: string;
}

export interface Budget {
  id: string;
  month: string;
  categoryId: string;
  limit: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string;
  currency: string;
  color: string;
  userName?: string;
}

export interface Rule {
  id: string;
  keyword: string;
  categoryId: string;
  subcategory: string;
}

export interface Investment {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balance: number;
  currency: string;
  source?: string;
  yieldRate?: number;
  yieldType?: "cdi" | "selic" | "pre" | "ipca";
  userName?: string;
}

export interface Loan {
  id: string;
  name: string;
  contractNumber: string;
  outstanding: number;
  installment: number;
  dueDate: string | null;
  currency: string;
  source?: string;
}

export interface RecurringBill {
  id: string;
  type?: "income" | "expense";
  description: string;
  amount: number;
  dueDay: number;
  categoryId: string;
  createdAt?: string;
  userName?: string;
}

export interface FinanceState {
  schemaVersion: 1;
  settings: FinanceSettings;
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  rules: Rule[];
  investments: Investment[];
  loans: Loan[];
  recurringBills?: RecurringBill[];
}

export type SyncStatus = "desconectado" | "sincronizando" | "sincronizado" | "pendente" | "erro" | "somente local";
