import type { FieldSource } from "@/types/domain";

/**
 * ClassificationEngine
 * --------------------
 * Motor de categorização por regras (ML-lite).
 *
 * Prioridade (do mais forte para o mais fraco):
 *   1. Categoria manual (override do usuário na própria transação)
 *   2. Regra aprendida (learned_categories, casamento por assinatura)
 *   3. Regra por palavra-chave (pluggy_category_rules kind=keyword)
 *   4. Categoria fornecida pelo Pluggy
 *   5. "Outros"
 *
 * A cada override manual do usuário, aprende via LearnedCategoriesRepository
 * (chamado de fora — o engine só sinaliza intenção via `shouldLearn`).
 */

export interface ClassificationInput {
  description: string;
  merchant?: string | null;
  pluggyCategory?: string | null;
  manualCategoryId?: string | null;
  amount?: number;
}

export interface KeywordRule {
  pattern: string;      // substring, case-insensitive
  categoryId: string;
  subcategory?: string | null;
}

export interface LearnedRule {
  signature: string;    // já normalizado
  categoryId: string;
  subcategory?: string | null;
  weight: number;
}

export interface Classification {
  categoryId: string;
  subcategory: string | null;
  source: FieldSource;
  confidence: number;
  reason: string;
}

const OTHERS: Classification = {
  categoryId: "outros",
  subcategory: null,
  source: "inferred",
  confidence: 20,
  reason: "fallback",
};

/** Normalizador determinístico usado como chave de aprendizagem. */
export function signatureOf(input: Pick<ClassificationInput, "description" | "merchant" | "pluggyCategory">): string {
  const raw = [input.merchant, input.description, input.pluggyCategory]
    .filter(Boolean)
    .join("|")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d{2,}/g, "#")
    .replace(/[^a-z0-9|# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw.slice(0, 160);
}

export const ClassificationEngine = {
  signatureOf,

  classify(
    input: ClassificationInput,
    ctx: { keywordRules: KeywordRule[]; learned: LearnedRule[] },
  ): Classification {
    if (input.manualCategoryId) {
      return {
        categoryId: input.manualCategoryId,
        subcategory: null,
        source: "manual",
        confidence: 100,
        reason: "manual_override",
      };
    }

    const sig = signatureOf(input);
    const learned = ctx.learned.find((r) => r.signature === sig);
    if (learned) {
      return {
        categoryId: learned.categoryId,
        subcategory: learned.subcategory ?? null,
        source: "inferred",
        confidence: Math.min(95, 60 + learned.weight * 5),
        reason: `learned(sig=${sig})`,
      };
    }

    const haystack = `${input.merchant ?? ""} ${input.description ?? ""}`.toLowerCase();
    const kw = ctx.keywordRules.find((r) => r.pattern && haystack.includes(r.pattern.toLowerCase()));
    if (kw) {
      return {
        categoryId: kw.categoryId,
        subcategory: kw.subcategory ?? null,
        source: "inferred",
        confidence: 75,
        reason: `keyword(${kw.pattern})`,
      };
    }

    if (input.pluggyCategory) {
      return {
        categoryId: input.pluggyCategory,
        subcategory: null,
        source: "openfinance",
        confidence: 45,
        reason: "pluggy_category",
      };
    }

    return OTHERS;
  },

  /** Retorna true quando um override manual deve ser convertido em regra aprendida. */
  shouldLearn(previous: Classification | null, next: Classification): boolean {
    if (next.source !== "manual") return false;
    if (!previous) return true;
    return previous.categoryId !== next.categoryId;
  },
};
