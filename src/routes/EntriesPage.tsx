import { useQuery } from "@tanstack/react-query";
import { EntryService } from "@/services/EntryService";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SOURCE_BADGE: Record<string, string> = {
  openfinance: "OF",
  manual: "Manual",
  calculated: "Calc",
  inferred: "Infer",
  imported: "Import",
};

export function EntriesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["entries"],
    queryFn: () => EntryService.list({ limit: 200 }),
    staleTime: 60 * 1000,
  });

  if (isLoading) return <p>Carregando lançamentos…</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>Erro: {(error as Error).message}</p>;
  if (!data?.length) return <p>Nenhum lançamento ainda. Sincronize uma conta para importar transações.</p>;

  const totalDebit = data.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amount, 0);
  const totalCredit = data.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <h2>Lançamentos</h2>
      <p style={{ color: "var(--muted)" }}>
        Dashboard baseado em <code>precis_entries</code> — nunca direto do Pluggy.
      </p>
      <div className="row" style={{ gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Saídas</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{brl(totalDebit)}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Entradas</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{brl(totalCredit)}</div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Saldo líquido</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{brl(totalCredit - totalDebit)}</div>
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: 8 }}>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Origem</th>
            <th style={{ textAlign: "right" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: 8, whiteSpace: "nowrap" }}>{e.date}</td>
              <td>{e.description}</td>
              <td style={{ color: "var(--muted)" }}>{e.categoryId ?? "—"}</td>
              <td><span className={`badge ${e.source}`}>{SOURCE_BADGE[e.source] ?? e.source}</span></td>
              <td style={{ textAlign: "right", color: e.direction === "debit" ? "var(--danger)" : "var(--ok)" }}>
                {e.direction === "debit" ? "−" : "+"}{brl(e.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
