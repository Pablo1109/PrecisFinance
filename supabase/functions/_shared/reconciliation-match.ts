/**
 * Reconciliation matching (Deno) — espelho do ReconciliationEngine.ts
 */

export interface RecoCandidate {
  entryId: string;
  score: number;
  reason: string;
}

export interface ExistingEntry {
  id: string;
  accountId: string | null;
  cardId: string | null;
  date: string;
  amount: number;
  direction: "debit" | "credit";
  description: string;
  source: string;
}

export interface NewTx {
  accountId: string;
  cardId: string | null;
  date: string;
  amount: number;
  description: string;
  direction: "debit" | "credit";
}

const DAY = 86_400_000;

function normalizeDesc(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findRecoCandidates(newTx: NewTx, existing: ExistingEntry[]): RecoCandidate[] {
  const newDate = new Date(newTx.date).getTime();
  const newDescNorm = normalizeDesc(newTx.description);
  const acctKey = newTx.cardId ?? newTx.accountId;

  return existing
    .filter((e) => e.source === "manual")
    .filter((e) => (e.cardId ?? e.accountId) === acctKey)
    .filter((e) => e.direction === newTx.direction)
    .filter((e) => Math.abs(new Date(e.date).getTime() - newDate) <= 3 * DAY)
    .filter((e) => {
      const diff = Math.abs(e.amount - Math.abs(newTx.amount));
      return diff <= 1 || diff / Math.max(1, Math.abs(newTx.amount)) <= 0.01;
    })
    .map((e) => {
      let score = 60;
      let reason = "mesma conta/direção, valor≈";
      const days = Math.round(Math.abs(new Date(e.date).getTime() - newDate) / DAY);
      if (days === 0) score += 15;
      else score += Math.max(0, 15 - days * 5);
      const eDesc = normalizeDesc(e.description);
      if (eDesc === newDescNorm) {
        score += 20;
        reason += " + descrição idêntica";
      } else if (eDesc.includes(newDescNorm) || newDescNorm.includes(eDesc)) {
        score += 10;
        reason += " + descrição parcial";
      }
      return { entryId: e.id, score: Math.min(100, score), reason };
    })
    .sort((a, b) => b.score - a.score);
}

export function canAutoMerge(candidate: RecoCandidate | undefined): boolean {
  return !!candidate && candidate.score >= 95;
}
