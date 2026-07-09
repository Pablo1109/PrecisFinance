import { supabase } from "@/lib/supabase";
import type { ReviewItem } from "@/types/domain";

function mapRow(r: any): ReviewItem {
  return {
    id: r.id,
    userId: r.user_id,
    syncRunId: r.sync_run_id,
    kind: r.kind,
    entity: r.entity,
    entityId: r.entity_id,
    payload: r.payload ?? {},
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
  };
}

export const ReviewQueueRepository = {
  async listOpen(): Promise<ReviewItem[]> {
    const { data, error } = await supabase
      .from("precis_review_queue")
      .select("*")
      .is("resolved_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async resolve(id: number, by: "user" | "auto" = "user") {
    const { error } = await supabase
      .from("precis_review_queue")
      .update({ resolved_at: new Date().toISOString(), resolved_by: by })
      .eq("id", id);
    if (error) throw error;
  },
};
