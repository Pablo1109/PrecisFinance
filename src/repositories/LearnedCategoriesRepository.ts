import { supabase } from "@/lib/supabase";
import type { LearnedRule } from "@/engines/ClassificationEngine";

export const LearnedCategoriesRepository = {
  async listAll(): Promise<LearnedRule[]> {
    const { data, error } = await supabase
      .from("precis_learned_categories")
      .select("signature, category_id, subcategory, weight");
    if (error) throw error;
    return (data ?? []).map((r) => ({
      signature: r.signature,
      categoryId: r.category_id,
      subcategory: r.subcategory,
      weight: r.weight,
    }));
  },

  async learn(userId: string, rule: LearnedRule) {
    const { error } = await supabase
      .from("precis_learned_categories")
      .upsert(
        {
          user_id: userId,
          signature: rule.signature,
          category_id: rule.categoryId,
          subcategory: rule.subcategory ?? null,
          weight: rule.weight,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,signature" },
      );
    if (error) throw error;
  },
};
