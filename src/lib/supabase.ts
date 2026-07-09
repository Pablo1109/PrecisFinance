import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabaseConfig";

const cfg = getSupabaseConfig();

if (cfg.issues.length) {
  // eslint-disable-next-line no-console
  console.warn("[precis] Supabase:", cfg.issues.join(" | "));
}

export const supabaseConfig = cfg;

export const supabase = createClient(cfg.url ?? "", cfg.rawKey || "", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
