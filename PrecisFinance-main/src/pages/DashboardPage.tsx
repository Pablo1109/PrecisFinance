import { useFinance } from "@/context/FinanceContext";
import { budgetAlerts, cardOutstanding, cardSpent, getMonthTransactions, monthlyTotals, totalPatrimony } from "@/domain/finance";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const { state } = useFinance();
  if (!state) return null;
  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(state, month);
  const recent = getMonthTransactions(state, month).slice(0, 6);
  const alerts = budgetAlerts(state, month);

  return (
    <>
      {alerts.length > 0 && (
        <section className="alerts">
          {alerts.slice(0, 3).map((a, i) => (
            <article key={i} className={`alert ${a.level}`}>
              <div><strong>{a.title}</strong><p>{a.message}</p></div>
            </article>
          ))}
        </section>
      )}

      <section className="metric-grid">
        <article className="metric-card positive"><span>Patrimônio</span><strong>{money(totalPatrimony(state))}</strong></article>
        <article className="metric-card positive"><span>Receitas</span><strong>{money(totals.income)}</strong></article>
        <article className="metric-card"><span>Despesas</span><strong>{money(totals.expense)}</strong></article>
        <article className={`metric-card ${totals.balance >= 0 ? "positive" : "negative"}`}><span>Saldo mensal</span><strong>{money(totals.balance)}</strong></article>
      </section>

      <section className="two-col" style={{ marginTop: 24 }}>
        <article className="panel">
          <div className="panel-header"><h2>Últimos lançamentos</h2></div>
          {recent.length ? (
            <ul className="mini-list">
              {recent.map((t) => (
                <li key={t.id}>
                  <span>{fmtDate(t.date)} · {t.description}</span>
                  <strong>{money(t.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Sem lançamentos no período.</p>}
          <Link to="/lancamentos" className="secondary-action" style={{ display: "inline-block", marginTop: 12 }}>Ver todos</Link>
        </article>

        <article className="panel">
          <div className="panel-header"><h2>Cartões</h2></div>
          <ul className="stack-list">
            {state.cards.map((c) => {
              const spent = cardSpent(state, c.id, month);
              const out = cardOutstanding(state, c.id, month);
              const pct = c.limit ? Math.min(100, (spent / c.limit) * 100) : 0;
              return (
                <li key={c.id}>
                  <div className="item-title"><strong>{c.name}</strong><span>{money(out)}</span></div>
                  <div className={`progress ${pct >= 80 ? "danger" : pct >= 50 ? "warn" : ""}`} style={{ ["--value" as string]: `${pct}%` }}><span /></div>
                  <small className="muted">Compras {money(spent)} · vence dia {c.dueDay}</small>
                </li>
              );
            })}
          </ul>
          {!state.cards.length && <p className="muted">Nenhum cartão cadastrado.</p>}
        </article>
      </section>
    </>
  );
}
