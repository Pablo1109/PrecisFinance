/**
 * ClassificationEngine (Deno) — espelho do src/engines/ClassificationEngine.ts
 */

export type FieldSource = "openfinance" | "calculated" | "manual" | "imported" | "inferred";

export interface ClassificationInput {
  description: string;
  merchant?: string | null;
  pluggyCategory?: string | null;
  manualCategoryId?: string | null;
}

export interface KeywordRule {
  pattern: string;
  categoryId: string;
  subcategory?: string | null;
}

export interface LearnedRule {
  signature: string;
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

export function classify(
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
      reason: `learned(${sig})`,
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
}
