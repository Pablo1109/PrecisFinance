import { supabase } from "@/lib/supabase";
import type { FinanceState } from "@/domain/types";
import { normalizeState } from "@/domain/seed";

const CACHE_PREFIX = "precis-finance-cloud-cache-v1:";
const LEGACY_KEY = "precis-finance-state-v1";

export const FinanceStateRepository = {
  async load(userId: string): Promise<{ state: FinanceState; updatedAt: string } | null> {
    const { data, error } = await supabase
      .from("finance_states")
      .select("state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { state: normalizeState(data.state), updatedAt: data.updated_at };
  },

  async save(userId: string, state: FinanceState): Promise<string> {
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from("finance_states").upsert(
      { user_id: userId, state, updated_at: updatedAt },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return updatedAt;
  },

  loadCache(userId: string): { state: FinanceState; updatedAt: string; dirty: boolean } | null {
    try {
      const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.state) {
        return {
          state: normalizeState(parsed.state),
          updatedAt: parsed.updatedAt || "",
          dirty: !!parsed.dirty,
        };
      }
      return { state: normalizeState(parsed), updatedAt: "", dirty: false };
    } catch {
      return null;
    }
  },

  saveCache(userId: string, state: FinanceState, updatedAt: string, dirty: boolean) {
    localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify({ state, updatedAt, dirty }));
  },

  loadLegacy(): FinanceState | null {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
};
