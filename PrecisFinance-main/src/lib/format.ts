const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function money(value: number, currency = "BRL"): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value ?? 0);
  } catch {
    return moneyFmt.format(value ?? 0);
  }
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(d + "T00:00:00"));
  } catch {
    return String(d);
  }
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
