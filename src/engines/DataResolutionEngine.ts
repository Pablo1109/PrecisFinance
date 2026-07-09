import { ConfidenceEngine } from "./ConfidenceEngine";
import type { FieldSource, ResolvedField } from "@/types/domain";

/**
 * DataResolutionEngine (DRE)
 * --------------------------
 * Serviço central que responde: "qual é o valor real deste campo?".
 *
 * Nenhuma tela consulta Pluggy diretamente — todas passam por aqui.
 *
 * Contrato:
 *   resolve<T>(field, candidates) → ResolvedField<T>
 *
 * O DRE recebe N candidatos (openfinance, manual override, valor calculado, etc),
 * pontua cada um via ConfidenceEngine e escolhe o vencedor. Sempre retorna um
 * envelope completo (valor + fonte + confiança + motivo + lista de candidatos)
 * para que a UI possa exibir o indicador visual de origem.
 */

export interface Candidate<T> {
  value: T | null;
  source: FieldSource;
  updatedAt?: string;
  /** Override manual pode passar confidence explícito. */
  confidence?: number;
  /** Motivo do candidato (ex.: "calc: total - available"). */
  note?: string;
}

export interface ResolveContext {
  entity: "account" | "card" | "bill" | "transaction" | "loan" | "investment";
  field: string;
}

export const DataResolutionEngine = {
  resolve<T>(ctx: ResolveContext, candidates: Array<Candidate<T>>): ResolvedField<T> {
    const now = new Date().toISOString();
    const scored = candidates
      .filter((c) => c !== undefined && c !== null)
      .map((c) => ({
        value: c.value,
        source: c.source,
        updatedAt: c.updatedAt ?? now,
        confidence: c.confidence ?? ConfidenceEngine.score(c.source, ctx),
        note: c.note,
      }));

    if (scored.length === 0) {
      return { value: null, source: "openfinance", confidence: 0, updatedAt: now, reason: "no_data" };
    }

    let winner = scored[0];
    for (let i = 1; i < scored.length; i++) {
      const picked = ConfidenceEngine.pickBest(winner, scored[i])!;
      winner = picked as typeof winner;
    }

    return {
      value: winner.value,
      source: winner.source,
      confidence: winner.confidence,
      updatedAt: winner.updatedAt,
      reason: winner.note ?? `picked ${winner.source} (score=${winner.confidence})`,
      candidates: scored.map((c) => ({ value: c.value, source: c.source, confidence: c.confidence })),
    };
  },

  /** Helper: candidato só é adicionado se valor não for null/undefined/NaN. */
  candidateOf<T>(value: T | null | undefined, source: FieldSource, extra?: Partial<Candidate<T>>): Candidate<T> | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number" && Number.isNaN(value)) return null;
    return { value: value as T, source, ...extra };
  },
};

export type { ResolvedField };
