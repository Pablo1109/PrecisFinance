import type { ResolvedField } from "@/types/domain";

interface Props<T> {
  field: ResolvedField<T>;
  format?: (v: T) => string;
}

const LABELS: Record<string, string> = {
  openfinance: "OF",
  calculated: "Calc",
  manual: "Manual",
  imported: "Import",
  inferred: "Infer",
};

export function FieldValue<T>({ field, format }: Props<T>) {
  const isNull = field.value === null || field.value === undefined;
  const rendered = isNull ? "—" : format ? format(field.value as T) : String(field.value);
  const badgeClass = `badge ${field.source}`;
  return (
    <div>
      <div className={`field-value ${isNull ? "null" : ""}`}>{rendered}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span className={badgeClass} title={field.reason}>{LABELS[field.source] ?? field.source}</span>
        <div className="conf-bar" style={{ flex: 1 }}>
          <span style={{ width: `${field.confidence}%` }} />
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{field.confidence}%</span>
      </div>
    </div>
  );
}
