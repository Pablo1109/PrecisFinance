/**
 * Precis Finance — tipos de domínio compartilhados entre frontend e edge functions.
 * Toda entidade financeira que passa pelo Data Resolution Engine referencia estes tipos.
 */

export type FieldSource = "openfinance" | "calculated" | "manual" | "imported" | "inferred";

export type Direction = "debit" | "credit";

/** Envelope padrão para um campo resolvido pelo DRE. */
export interface ResolvedField<T> {
  value: T | null;
  source: FieldSource;
  confidence: number; // 0..100
  updatedAt: string;  // ISO
  reason?: string;    // por que o DRE escolheu essa origem
  candidates?: Array<{ value: T | null; source: FieldSource; confidence: number }>;
}

/** Chave estável de override no banco. */
export interface OverrideKey {
  entity: "account" | "card" | "bill" | "transaction" | "loan" | "investment";
  entityId: string;
  field: string;
}

export interface FieldOverride<T = unknown> extends OverrideKey {
  value: T;
  source: FieldSource;
  confidence: number;
  reason?: string;
  updatedAt: string;
}

/** Card financeiro totalmente resolvido (o que o dashboard consome). */
export interface ResolvedCard {
  cardId: string;
  itemId: string;
  displayName: ResolvedField<string>;
  brand: ResolvedField<string>;
  lastFour: ResolvedField<string>;
  creditLimit: ResolvedField<number>;
  availableLimit: ResolvedField<number>;
  usedLimit: ResolvedField<number>;
  currentBillAmount: ResolvedField<number>;
  closedBillAmount: ResolvedField<number>;
  minimumPayment: ResolvedField<number>;
  dueDay: ResolvedField<number>;
  closingDay: ResolvedField<number>;
  bestPurchaseDay: ResolvedField<number>;
  nextDueDate: ResolvedField<string>;
  nextClosingDate: ResolvedField<string>;
  futureInstallments: ResolvedField<number>;
  currentInstallments: ResolvedField<number>;
  currencyCode: string;
  updatedAt: string;
}

/** Lançamento unificado — coração do sistema. */
export interface FinanceEntry {
  id: string;
  userId: string;
  accountId: string | null;
  cardId: string | null;
  date: string;             // YYYY-MM-DD
  postedAt: string | null;
  amount: number;
  currencyCode: string;
  direction: Direction;
  description: string;
  merchant: string | null;
  categoryId: string | null;
  subcategory: string | null;
  tags: string[];
  costCenter: string | null;
  notes: string | null;
  isInstallment: boolean;
  installmentNumber: number | null;
  installmentTotal: number | null;
  billId: string | null;
  source: FieldSource;
  sourceRef: string | null;
  externalHash: string | null;
  reconciledWith: string | null;
  confidence: number;
  raw?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  userId: string;
  itemId: string | null;
  scope: "item" | "all";
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "ok" | "partial" | "error";
  counts: Record<string, number>;
  message: string | null;
}

export interface ReviewItem {
  id: number;
  userId: string;
  syncRunId: string;
  kind: "new_entry" | "reconcile_candidate" | "category_learned" | "card_incomplete" | "conflict";
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  resolvedAt: string | null;
  resolvedBy: "user" | "auto" | null;
  createdAt: string;
}
