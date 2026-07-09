import { supabase } from "@/lib/supabase";
import type { FieldOverride, OverrideKey } from "@/types/domain";

const table = "precis_field_overrides";

export const OverridesRepository = {
  async listForEntity(entity: OverrideKey["entity"], entityId: string): Promise<FieldOverride[]> {
    const { data, error } = await supabase
      .from(table)
      .select("entity, entity_id, field, value, source, confidence, reason, updated_at")
      .eq("entity", entity)
      .eq("entity_id", entityId);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      entity: r.entity,
      entityId: r.entity_id,
      field: r.field,
      value: r.value,
      source: r.source,
      confidence: r.confidence,
      reason: r.reason ?? undefined,
      updatedAt: r.updated_at,
    }));
  },

  async upsert(userId: string, override: Omit<FieldOverride, "updatedAt">) {
    const { error } = await supabase.from(table).upsert(
      {
        user_id: userId,
        entity: override.entity,
        entity_id: override.entityId,
        field: override.field,
        value: override.value,
        source: override.source,
        confidence: override.confidence,
        reason: override.reason ?? null,
      },
      { onConflict: "user_id,entity,entity_id,field" },
    );
    if (error) throw error;
  },

  async remove(userId: string, key: OverrideKey) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId)
      .eq("entity", key.entity)
      .eq("entity_id", key.entityId)
      .eq("field", key.field);
    if (error) throw error;
  },
};
