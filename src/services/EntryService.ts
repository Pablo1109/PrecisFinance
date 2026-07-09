import { ClassificationEngine, signatureOf } from "@/engines/ClassificationEngine";
import { ReconciliationEngine } from "@/engines/ReconciliationEngine";
import { EntriesRepository } from "@/repositories/EntriesRepository";
import { LearnedCategoriesRepository } from "@/repositories/LearnedCategoriesRepository";
import { OverridesRepository } from "@/repositories/OverridesRepository";
import { ReviewQueueRepository } from "@/repositories/ReviewQueueRepository";
import type { FinanceEntry } from "@/types/domain";

/**
 * EntryService — camada única para lançamentos (precis_entries).
 * Dashboard e extrato devem consumir apenas este serviço.
 */
export const EntryService = {
  async list(params: Parameters<typeof EntriesRepository.list>[0] = {}) {
    return EntriesRepository.list(params);
  },

  async createManual(userId: string, entry: Parameters<typeof EntriesRepository.createManual>[1]) {
    return EntriesRepository.createManual(userId, entry);
  },

  async setCategory(userId: string, entryId: string, categoryId: string, input: { description: string; merchant?: string | null; pluggyCategory?: string | null }) {
    const entries = await EntriesRepository.list({ limit: 500 });
    const current = entries.find((e) => e.id === entryId);
    const previous = current?.categoryId
      ? { categoryId: current.categoryId, subcategory: current.subcategory, source: current.source as "manual", confidence: 100, reason: "existing" }
      : null;
    const next = { categoryId, subcategory: null, source: "manual" as const, confidence: 100, reason: "user_correction" };

    await OverridesRepository.upsert(userId, {
      entity: "transaction",
      entityId: entryId,
      field: "category_id",
      value: categoryId,
      source: "manual",
      confidence: 100,
      reason: "user_correction",
    });
    await EntriesRepository.update(entryId, { category_id: categoryId, source: "manual" } as any);

    if (ClassificationEngine.shouldLearn(previous, next)) {
      await LearnedCategoriesRepository.learn(userId, {
        signature: signatureOf(input),
        categoryId,
        subcategory: null,
        weight: 1,
      });
    }
  },

  async acceptReconciliation(userId: string, reviewId: number, manualEntryId: string, ofTxId: string) {
    await EntriesRepository.update(manualEntryId, {
      source_ref: ofTxId,
      confidence: 100,
    } as any);
    await ReviewQueueRepository.resolve(reviewId, "user");
    void userId;
  },

  async findRecoCandidatesForEntry(entry: FinanceEntry, pool: FinanceEntry[]) {
    const accountId = entry.cardId ?? entry.accountId ?? "";
    return ReconciliationEngine.findCandidates(
      {
        accountId,
        date: entry.date,
        amount: entry.amount,
        description: entry.description,
        direction: entry.direction,
      },
      pool,
    );
  },
};
