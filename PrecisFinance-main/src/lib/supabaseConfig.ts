export interface SupabaseConfigStatus {
  rawUrl: string;
  rawKey: string;
  url: string | null;
  valid: boolean;
  issues: string[];
}

/** Corrige URL do dashboard → API. Ex: .../project/abc → https://abc.supabase.co */
export function normalizeSupabaseUrl(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  const fromDashboard = trimmed.match(/project\/([a-z0-9]+)/i);
  if (fromDashboard) {
    return `https://${fromDashboard[1]}.supabase.co`;
  }

  return null;
}

export function getSupabaseConfig(): SupabaseConfigStatus {
  const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";
  const url = normalizeSupabaseUrl(rawUrl);
  const issues: string[] = [];

  if (!rawUrl) issues.push("VITE_SUPABASE_URL ausente no .env");
  else if (!url) issues.push("VITE_SUPABASE_URL inválida — use https://SEU-PROJETO.supabase.co (não o link do dashboard)");

  if (!rawKey) issues.push("VITE_SUPABASE_ANON_KEY ausente no .env");
  else if (!rawKey.startsWith("eyJ") && !rawKey.startsWith("sb_")) {
    issues.push("A anon key parece inválida — copie em Supabase → Settings → API → anon public");
  }

  return {
    rawUrl,
    rawKey,
    url,
    valid: !!url && rawKey.length > 20,
    issues,
  };
}
