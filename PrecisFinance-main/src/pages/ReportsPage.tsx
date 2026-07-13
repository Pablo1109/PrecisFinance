import { useFinance } from "@/context/FinanceContext";
import { expenseByCategory, monthlyTotals, savingsRate, monthLabel } from "@/domain/finance";
import { money } from "@/lib/format";

export function ReportsPage() {
  const { state } = useFinance();
  if (!state) return null;
  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(state, month);
  const byCat = expenseByCategory(state, month);

  return (
    <section className="metric-grid">
      <article className="panel"><h3>Taxa de poupança</h3><strong>{savingsRate(state, month)}%</strong></article>
      <article className="panel"><h3>Receitas ({monthLabel(month)})</h3><strong>{money(totals.income)}</strong></article>
      <article className="panel"><h3>Despesas</h3><strong>{money(totals.expense)}</strong></article>
      <article className="panel">
        <h3>Ranking de categorias</h3>
        <ul className="legend-list">
          {byCat.map((c) => (
            <li key={c.name}><span>{c.name}</span><strong>{money(c.total)}</strong></li>
          ))}
        </ul>
      </article>
    </section>
  );
}
