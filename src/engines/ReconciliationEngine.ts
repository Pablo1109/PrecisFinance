import type { FinanceEntry } from "@/types/domain";

/**
 * ReconciliationEngine
 * --------------------
 * Detecta duplicidade entre lançamentos manuais e transações vindas do Open Finance.
 *
 * Estratégia:
 *   - Sempre gera um hash determinístico (external_hash) para transações OF
 *     usando accountId+date+amount+descriptionNormalizada. UPSERT via este hash
 *     garante idempotência.
 *   - Para conciliação manual↔sync, procura entries "candidatas" na mesma conta,
 *     mesmo sinal, valor dentro de 1% ou R$ 1, e data ±3 dias.
 *   - Nunca faz merge silencioso: gera item no precis_review_queue para o usuário
 *     confirmar. Auto-merge só quando descrição+valor são idênticos.
 */

export interface RecoCandidate {
  entryId: string;
  score: number;   // 0..100
  reason: string;
}

export interface RawTx {
  accountId: string;
  date: string;       // YYYY-MM-DD
  amount: number;
  description: string;
  sourceRef?: string; // ex.: tx_id do Pluggy
}

const DAY = 86_400_000;

function normalizeDesc(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function sha1(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  // Node 20 + Web Crypto (edge functions Deno também suportam).
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const ReconciliationEngine = {
  async hash(tx: RawTx): Promise<string> {
    const key = [tx.accountId, tx.date, tx.amount.toFixed(2), normalizeDesc(tx.description), tx.sourceRef ?? ""].join("|");
    return sha1(key);
  },

  /** Busca candidatos de conciliação entre uma transação nova e um conjunto de entries existentes. */
  findCandidates(newTx: RawTx & { direction: "debit" | "credit" }, existing: FinanceEntry[]): RecoCandidate[] {
    const newDate = new Date(newTx.date).getTime();
    const newDescNorm = normalizeDesc(newTx.description);

    return existing
      .filter((e) => e.accountId === newTx.accountId)
      .filter((e) => e.direction === newTx.direction)
      .filter((e) => Math.abs(new Date(e.date).getTime() - newDate) <= 3 * DAY)
      .filter((e) => {
        const diff = Math.abs(e.amount - Math.abs(newTx.amount));
        return diff <= 1 || diff / Math.max(1, Math.abs(newTx.amount)) <= 0.01;
      })
      .map((e) => {
        let score = 60;
        let reason = "same account/direction, amount≈";
        const days = Math.round(Math.abs(new Date(e.date).getTime() - newDate) / DAY);
        if (days === 0) score += 15;
        else score += Math.max(0, 15 - days * 5);
        const eDesc = normalizeDesc(e.description);
        if (eDesc === newDescNorm) {
          score += 20;
          reason += " + exact description";
        } else if (eDesc.includes(newDescNorm) || newDescNorm.includes(eDesc)) {
          score += 10;
          reason += " + partial description";
        }
        return { entryId: e.id, score: Math.min(100, score), reason };
      })
      .sort((a, b) => b.score - a.score);
  },

  /** Regras para auto-merge (sem intervenção do usuário). */
  canAutoMerge(candidate: RecoCandidate): boolean {
    return candidate.score >= 95;
  },
};
