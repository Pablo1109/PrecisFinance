import { FormEvent } from "react";
import { useFinance } from "@/context/FinanceContext";
import { categorySpent } from "@/domain/finance";
import { money, uid } from "@/lib/format";
import { shiftMonth } from "@/domain/finance";

export function BudgetsPage() {
  const { state, update } = useFinance();
  if (!state) return null;
  const month = state.settings.selectedMonth;
  const budgets = state.budgets.filter((b) => b.month === month);

  function addBudget(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => {
      s.budgets.push({
        id: uid("bud"),
        month,
        categoryId: String(fd.get("categoryId")),
        limit: Number(fd.get("limit")),
      });
    });
    e.currentTarget.reset();
  }

  function copyPrevious() {
    const prev = shiftMonth(month, -1);
    update((s) => {
      const existing = new Set(s.budgets.filter((b) => b.month === month).map((b) => b.categoryId));
      s.budgets.filter((b) => b.month === prev).forEach((b) => {
        if (!existing.has(b.categoryId)) {
          s.budgets.push({ id: uid("bud"), month, categoryId: b.categoryId, limit: b.limit });
        }
      });
    });
  }

  return (
    <>
      <section className="actions-row">
        <button type="button" className="secondary-action" onClick={copyPrevious}>Copiar mês anterior</button>
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <form onSubmit={addBudget} className="form-grid">
          <label>Categoria<select name="categoryId" required>{state.categories.filter((c) => c.type === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Limite<input name="limit" type="number" step="0.01" required /></label>
          <button type="submit" className="primary-action">Adicionar orçamento</button>
        </form>
      </section>
      <section className="stack-list">
        {budgets.map((b) => {
          const cat = state.categories.find((c) => c.id === b.categoryId);
          const spent = categorySpent(state, b.categoryId, month);
          const pct = b.limit ? Math.min(100, (spent / b.limit) * 100) : 0;
          return (
            <article key={b.id} className="panel">
              <div className="item-title"><strong>{cat?.name}</strong><span>{money(spent)} / {money(b.limit)}</span></div>
              <div className={`progress ${pct >= 100 ? "danger" : pct >= 80 ? "warn" : ""}`} style={{ ["--value" as string]: `${pct}%` }}><span /></div>
            </article>
          );
        })}
      </section>
    </>
  );
}
