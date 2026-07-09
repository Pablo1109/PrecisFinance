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

  async listForEntities(entity: OverrideKey["entity"], entityIds: string[]): Promise<Map<string, FieldOverride[]>> {
    const map = new Map<string, FieldOverride[]>();
    if (entityIds.length === 0) return map;
    const { data, error } = await supabase
      .from(table)
      .select("entity, entity_id, field, value, source, confidence, reason, updated_at")
      .eq("entity", entity)
      .in("entity_id", entityIds);
    if (error) throw error;
    for (const r of data ?? []) {
      const row: FieldOverride = {
        entity: r.entity,
        entityId: r.entity_id,
        field: r.field,
        value: r.value,
        source: r.source,
        confidence: r.confidence,
        reason: r.reason ?? undefined,
        updatedAt: r.updated_at,
      };
      if (!map.has(r.entity_id)) map.set(r.entity_id, []);
      map.get(r.entity_id)!.push(row);
    }
    return map;
  },

  async writeHistory(userId: string, key: OverrideKey, oldValue: unknown | null, newValue: unknown, oldSource?: string) {
    const { error } = await supabase.from("precis_field_history").insert({
      user_id: userId,
      entity: key.entity,
      entity_id: key.entityId,
      field: key.field,
      old_value: oldValue,
      new_value: newValue,
      old_source: oldSource ?? null,
      new_source: "manual",
      reason: "user_correction",
    });
    if (error) console.warn("[overrides] history:", error.message);
  },

  async upsert(userId: string, override: Omit<FieldOverride, "updatedAt">, prev?: { value: unknown; source?: string }) {
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
    if (prev && JSON.stringify(prev.value) !== JSON.stringify(override.value)) {
      await OverridesRepository.writeHistory(userId, override, prev.value, override.value, prev.source);
    }
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
