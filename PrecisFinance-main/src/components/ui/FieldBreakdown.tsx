import type { ResolvedField } from "@/types/domain";

interface Props<T> {
  field: ResolvedField<T>;
  label: string;
  format?: (v: T) => string;
  onRevert?: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  openfinance: "Open Finance",
  calculated: "Calculado",
  manual: "Manual",
  imported: "Importado",
  inferred: "Inferido",
};

export function FieldBreakdown<T>({ field, label, format, onRevert }: Props<T>) {
  const fmt = (v: T | null) => {
    if (v == null) return "—";
    return format ? format(v) : String(v);
  };

  const ofCand = field.candidates?.find((c) => c.source === "openfinance");
  const manualCand = field.candidates?.find((c) => c.source === "manual");
  const calcCand = field.candidates?.find((c) => c.source === "calculated");

  return (
    <div className="field-breakdown" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div className="row" style={{ fontSize: 13 }}>
        <span style={{ color: "var(--muted)", minWidth: 100 }}>Sincronizado</span>
        <span>{fmt(ofCand?.value as T ?? null)}</span>
      </div>
      {calcCand && (
        <div className="row" style={{ fontSize: 13 }}>
          <span style={{ color: "var(--muted)", minWidth: 100 }}>Calculado</span>
          <span>{fmt(calcCand.value)}</span>
        </div>
      )}
      <div className="row" style={{ fontSize: 13 }}>
        <span style={{ color: "var(--muted)", minWidth: 100 }}>Manual</span>
        <span>{manualCand ? fmt(manualCand.value) : "—"}</span>
      </div>
      <div className="row" style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
        <span style={{ minWidth: 100 }}>Valor final</span>
        <span>{fmt(field.value)}</span>
        <span className={`badge ${field.source}`} style={{ marginLeft: 8 }}>
          {SOURCE_LABELS[field.source] ?? field.source}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>{field.confidence}%</span>
      </div>
      {manualCand && onRevert && (
        <button type="button" className="ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={onRevert}>
          Voltar ao sincronizado
        </button>
      )}
    </div>
  );
}
