import { useFinance } from "@/context/FinanceContext";
import {
  budgetAlerts,
  billReminderAlerts,
  cardSpent,
  cardPayments,
  getMonthTransactions,
  monthlyTotals,
  totalPatrimony,
  expenseByCategory,
  shiftMonth,
  mergeStates,
} from "@/domain/finance";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";
import { useMemo } from "react";

export function DashboardPage({ consolidated = false }: { consolidated?: boolean }) {
  const { rawState, spouseState } = useFinance();

  const state = useMemo(() => {
    if (consolidated && rawState && spouseState) {
      return mergeStates(rawState, spouseState);
    }
    return rawState;
  }, [consolidated, rawState, spouseState]);

  if (!state) return null;

  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(state, month);
  
  // Calculate today's transactions vs recent ones
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxs = useMemo(() => {
    return state.transactions.filter(t => t.date === todayStr && !t.ignored);
  }, [state.transactions, todayStr]);

  const recent = useMemo(() => {
    return getMonthTransactions(state, month).slice(0, 6);
  }, [state, month]);

  const alerts = useMemo(() => {
    return [
      ...billReminderAlerts(state, month),
      ...budgetAlerts(state, month)
    ];
  }, [state, month]);

  // Category Expenses Calculation
  const expensesByCat = useMemo(() => expenseByCategory(state, month), [state, month]);
  const totalExpense = totals.expense;

  // Donut chart calculations
  const radius = 50;
  const circ = 2 * Math.PI * radius; // ~314.16
  
  const chartSlices = useMemo(() => {
    let accumulatedPercent = 0;
    return expensesByCat.map((c) => {
      const pct = totalExpense > 0 ? c.total / totalExpense : 0;
      const strokeDash = `${pct * circ} ${circ}`;
      const angle = accumulatedPercent * 360 - 90;
      accumulatedPercent += pct;
      return {
        name: c.name,
        color: c.color,
        total: c.total,
        percent: Math.round(pct * 100),
        strokeDash,
        angle,
      };
    });
  }, [expensesByCat, totalExpense, circ]);

  // Next Month Forecast Calculations
  const forecast = useMemo(() => {
    const nextMonthStr = shiftMonth(month, 1);
    const currentBankBalance = state.accounts.reduce((sum, a) => sum + a.balance, 0);
    const fixedIncomesTotal = (state.recurringBills || []).filter((b) => b.type === "income").reduce((sum, b) => sum + b.amount, 0);
    const fixedBillsTotal = (state.recurringBills || []).filter((b) => (b.type || "expense") === "expense").reduce((sum, b) => sum + b.amount, 0);
    const cardInvoicesTotal = state.cards.reduce((sum, c) => sum + cardSpent(state, c.id, nextMonthStr), 0);
    const expectedExpenses = fixedBillsTotal + cardInvoicesTotal;
    const expectedBalance = currentBankBalance + fixedIncomesTotal - expectedExpenses;
    
    return {
      nextMonthStr,
      currentBankBalance,
      fixedIncomesTotal,
      expectedExpenses,
      expectedBalance,
    };
  }, [state, month]);

  return (
    <>
      {alerts.length > 0 && (
        <section className="alerts" style={{ marginBottom: 24 }}>
          {alerts.slice(0, 6).map((a, i) => (
            <article key={i} className={`alert ${a.level}`}>
              <div>
                <strong>{a.title}</strong>
                <p>{a.message}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Metrics Row */}
      <section className="metric-grid">
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div>
            <span>Patrimônio</span>
            <strong>{money(totalPatrimony(state))}</strong>
          </div>
        </article>
        <article className="metric-card income">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </div>
          <div>
            <span>Receitas</span>
            <strong>{money(totals.income)}</strong>
          </div>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>
          </div>
          <div>
            <span>Despesas</span>
            <strong>{money(totals.expense)}</strong>
          </div>
        </article>
        <article className={`metric-card balance ${totals.balance >= 0 ? "positive" : "negative"}`}>
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div>
            <span>Saldo mensal</span>
            <strong>{money(totals.balance)}</strong>
          </div>
        </article>
      </section>

      {/* Bento Grid Dashboard Layout */}
      <section className="dashboard-bento" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        
        {/* Bento Card 1: Category Expenses Chart */}
        <article className="panel bento-card chart-card">
          <div className="panel-header">
            <h2>Divisão de Despesas</h2>
          </div>
          
          {totalExpense > 0 ? (
            <div className="chart-content">
              <div className="donut-svg-wrapper">
                <svg width={160} height={160} viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r={radius} fill="transparent" stroke="var(--line)" strokeWidth="12" />
                  
                  {chartSlices.map((slice, i) => (
                    <circle
                      key={i}
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="12"
                      strokeDasharray={slice.strokeDash}
                      transform={`rotate(${slice.angle} 80 80)`}
                      strokeLinecap={slice.percent === 100 ? "butt" : "round"}
                      style={{ transition: "stroke-dasharray 0.3s ease" }}
                    />
                  ))}
                  
                  <text x="80" y="73" textAnchor="middle" className="donut-center-lbl">TOTAL</text>
                  <text x="80" y="93" textAnchor="middle" className="donut-center-val">{money(totalExpense).split(",")[0]}</text>
                </svg>
              </div>
              
              <ul className="donut-legend">
                {chartSlices.slice(0, 5).map((slice, i) => (
                  <li key={i}>
                    <span className="legend-color-dot" style={{ backgroundColor: slice.color }} />
                    <span className="legend-name">{slice.name}</span>
                    <span className="legend-percent">{slice.percent}%</span>
                    <strong className="legend-val">{money(slice.total)}</strong>
                  </li>
                ))}
                {chartSlices.length > 5 && (
                  <li className="legend-more">
                    <span className="legend-color-dot" style={{ backgroundColor: "#94a3b8" }} />
                    <span className="legend-name">Outros ({chartSlices.length - 5})</span>
                    <strong className="legend-val">
                      {money(chartSlices.slice(5).reduce((acc, s) => acc + s.total, 0))}
                    </strong>
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <div className="chart-empty-state">
              <div className="empty-chart-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, background: "var(--surface-2)", borderRadius: "50%", color: "var(--muted)", margin: "0 auto 12px" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
              </div>
              <p className="muted">Nenhuma despesa registrada neste mês para gerar o gráfico.</p>
            </div>
          )}
        </article>

        {/* Bento Card 2: Checking Accounts and Banks */}
        <article className="panel bento-card accounts-card">
          <div className="panel-header">
            <h2>Minhas Contas e Bancos</h2>
            <Link to="/contas" className="ghost-action">Ver todas</Link>
          </div>
          <div className="accounts-list-widget">
            {state.accounts.slice(0, 4).map((acc) => (
              <div key={acc.id} className="account-row-item">
                <div className="account-details">
                  <span className="account-color-dot" style={{ backgroundColor: acc.color }} />
                  <div>
                    <strong>{acc.name}</strong>
                    <span className="account-source-badge">{acc.source === "pluggy" ? "Open Finance" : "Manual"}</span>
                  </div>
                </div>
                <span className="account-balance-value">{money(acc.balance)}</span>
              </div>
            ))}
            {!state.accounts.length && <p className="muted">Nenhuma conta cadastrada.</p>}
          </div>
        </article>

        {/* Bento Card 3: Credit Cards Mockup-style (Displays ALL credit cards) */}
        <article className="panel bento-card cards-card" style={{ gridColumn: "span 1" }}>
          <div className="panel-header">
            <h2>Faturas de Cartão</h2>
            <Link to="/cartoes" className="ghost-action">Gerenciar</Link>
          </div>
          <div className="credit-cards-list-widget" style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: 310 }}>
            {state.cards.map((c) => {
              const spent = cardSpent(state, c.id, month);
              const payments = cardPayments(state, c.id, month);
              const outstanding = Math.max(0, spent - payments);
              const pct = c.limit ? Math.min(100, (outstanding / c.limit) * 100) : 0;
              const c1 = (c.color || "#6366f1").split(",")[0];
              const c2 = (c.color || "#6366f1,#1e1b4b").split(",")[1] || "rgba(0, 0, 0, 0.45)";
              const gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
              return (
                <div key={c.id} className="credit-card-mockup-mini" style={{ background: gradient, color: "#fff", padding: "14px 16px", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.95rem" }}>{c.name}</strong>
                    <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>{c.brand}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "0.7rem", opacity: 0.8, display: "block", color: "rgba(255, 255, 255, 0.7)" }}>Saldo Devedor</span>
                      <strong style={{ fontSize: "1.1rem" }}>{money(outstanding)}</strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.7rem", opacity: 0.8, display: "block", color: "rgba(255, 255, 255, 0.7)" }}>Limite total</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{money(c.limit)}</span>
                    </div>
                  </div>
                  <div className="limit-progress-bar" style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                    <span className="limit-bar-fill" style={{ display: "block", height: "100%", width: `${pct}%`, backgroundColor: "#fff" }} />
                  </div>
                </div>
              );
            })}
            {!state.cards.length && <p className="muted">Nenhum cartão cadastrado.</p>}
          </div>
        </article>

        {/* Bento Card 4: Recent and Daily Transactions */}
        <article className="panel bento-card transactions-card">
          <div className="panel-header">
            <h2>{todayTxs.length > 0 ? "Últimos Lançamentos do Dia" : "Lançamentos Recentes"}</h2>
            <Link to="/lancamentos" className="ghost-action">Ver tudo</Link>
          </div>
          
          {todayTxs.length > 0 ? (
            <ul className="mini-transactions-list">
              {todayTxs.map((t) => {
                const cat = state.categories.find((c) => c.id === t.categoryId);
                return (
                  <li key={t.id} className={`tx-item-row ${t.type}`}>
                    <div className="tx-left">
                      <span className="tx-category-badge" style={{ backgroundColor: cat?.color ?? "#94a3b8" }}>
                        {cat?.name?.charAt(0) || "T"}
                      </span>
                      <div className="tx-text">
                        <strong>{t.description}</strong>
                        <span>Hoje · {cat?.name || "Sem categoria"}</span>
                      </div>
                    </div>
                    <strong className={`tx-amount-value ${t.type}`}>
                      {t.type === "expense" ? "-" : "+"} {money(t.amount)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : recent.length ? (
            <ul className="mini-transactions-list">
              {recent.map((t) => {
                const cat = state.categories.find((c) => c.id === t.categoryId);
                return (
                  <li key={t.id} className={`tx-item-row ${t.type}`}>
                    <div className="tx-left">
                      <span className="tx-category-badge" style={{ backgroundColor: cat?.color ?? "#94a3b8" }}>
                        {cat?.name?.charAt(0) || "T"}
                      </span>
                      <div className="tx-text">
                        <strong>{t.description}</strong>
                        <span>{fmtDate(t.date)} · {cat?.name || "Sem categoria"}</span>
                      </div>
                    </div>
                    <strong className={`tx-amount-value ${t.type}`}>
                      {t.type === "expense" ? "-" : "+"} {money(t.amount)}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">Sem lançamentos no período.</p>
          )}
        </article>

        {/* Bento Card 5: Previsão do Fluxo do Próximo Mês */}
        <article className="panel bento-card forecast-card" style={{ gridColumn: "1 / -1", borderLeft: `6px solid ${forecast.expectedBalance < 0 ? "var(--red)" : "var(--brand)"}` }}>
          <div className="panel-header">
            <h2>Previsão do Fluxo do Próximo Mês ({forecast.nextMonthStr})</h2>
            <Link to="/contas-fixas" className="ghost-action">Planejamento</Link>
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginTop: 12 }}>
            <div>
              <span className="muted" style={{ fontSize: "0.8rem" }}>Saldo das Contas Atual:</span>
              <h4 style={{ fontSize: "1.2rem", color: "var(--ink)" }}>{money(forecast.currentBankBalance)}</h4>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.8rem" }}>Receitas Fixas Previstas (+):</span>
              <h4 style={{ fontSize: "1.2rem", color: "var(--green)" }}>{money(forecast.fixedIncomesTotal)}</h4>
            </div>
            <div>
              <span className="muted" style={{ fontSize: "0.8rem" }}>Despesas Fixas e Cartões (-):</span>
              <h4 style={{ fontSize: "1.2rem", color: "var(--red)" }}>-{money(forecast.expectedExpenses)}</h4>
            </div>
            <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <span className="muted" style={{ fontSize: "0.75rem" }}>Saldo Final Projetado:</span>
              <strong style={{ fontSize: "1.3rem", color: forecast.expectedBalance < 0 ? "var(--red)" : "var(--green)" }}>
                {money(forecast.expectedBalance)}
              </strong>
              {forecast.expectedBalance < 0 && (
                <span className="pill danger" style={{ fontSize: "0.6rem", padding: "2px 4px", marginTop: 4, width: "fit-content" }}>
                  ⚠️ Risco de Vermelho
                </span>
              )}
            </div>
          </div>
        </article>

      </section>
    </>
  );
}
