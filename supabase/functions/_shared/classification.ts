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

  const haystack = `${input.merchant ?? ""} ${input.description ?? ""}`.toLowerCase();

  // 1. Auto detect investments
  if (/rdb|cdb|aplicac|resgate|invest|poupanca|poupança/i.test(haystack)) {
    return {
      categoryId: "cat_investment",
      subcategory: null,
      source: "calculated",
      confidence: 90,
      reason: "auto_investment",
    };
  }

  // 2. Auto detect transfers between own accounts
  if (/transfer|ted|doc|pix|recebida|enviada/i.test(haystack) && /pablo.*melo/i.test(haystack)) {
    return {
      categoryId: "cat_transfer",
      subcategory: null,
      source: "calculated",
      confidence: 95,
      reason: "auto_transfer",
    };
  }

  // 3. Fallback keywords classification rules
  if (/supermercado|mercado|ifood|refeicao|restaurante|pizzaria|burger/i.test(haystack)) {
    return { categoryId: "cat_food", subcategory: null, source: "inferred", confidence: 80, reason: "auto_food" };
  }
  if (/aluguel|condominio|reforma|energia|luz|agua|gás|gas|internet/i.test(haystack)) {
    return { categoryId: "cat_home", subcategory: null, source: "inferred", confidence: 80, reason: "auto_home" };
  }
  if (/uber|cabify|99taxis|posto|combustivel|gasolina|pedagio|estaciona/i.test(haystack)) {
    return { categoryId: "cat_transport", subcategory: null, source: "inferred", confidence: 80, reason: "auto_transport" };
  }
  if (/farmacia|drogaria|saude|hospital|medico|odonto|clinica/i.test(haystack)) {
    return { categoryId: "cat_health", subcategory: null, source: "inferred", confidence: 80, reason: "auto_health" };
  }
  if (/netflix|spotify|prime|hbo|disney|globo/i.test(haystack)) {
    return { categoryId: "cat_subs", subcategory: null, source: "inferred", confidence: 80, reason: "auto_subs" };
  }
  if (/fatura|anuidade|tarifa|juros/i.test(haystack)) {
    return { categoryId: "cat_cards", subcategory: null, source: "inferred", confidence: 80, reason: "auto_cards" };
  }
  if (/cinema|teatro|show|viagem|decolar|hotel|voo|lazer/i.test(haystack)) {
    return { categoryId: "cat_leisure", subcategory: null, source: "inferred", confidence: 80, reason: "auto_leisure" };
  }

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
