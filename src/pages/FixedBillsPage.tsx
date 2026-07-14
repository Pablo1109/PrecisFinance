import { FormEvent, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money } from "@/lib/format";
import { cardSpent, shiftMonth } from "@/domain/finance";
import { uid } from "@/lib/format";

type RecurrenceTab = "expense" | "income";

export function FixedBillsPage() {
  const { state, update } = useFinance();
  
  const [activeTab, setActiveTab] = useState<RecurrenceTab>("expense");
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form states
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState(10);
  const [catId, setCatId] = useState("");

  if (!state) return null;

  const rawBills = state.recurringBills || [];
  const month = state.settings.selectedMonth;

  // Filter lists based on the active tab
  const filteredList = useMemo(() => {
    return rawBills.filter((b) => {
      const type = b.type || "expense";
      return type === activeTab;
    });
  }, [rawBills, activeTab]);

  // Filter dropdown categories based on the active tab
  const activeCategories = useMemo(() => {
    return (state.categories || []).filter((c) => {
      return activeTab === "expense" ? c.type === "fixed" : c.type === "income";
    });
  }, [state.categories, activeTab]);

  // Calculate matching paid status for current month
  const billsStatus = useMemo(() => {
    return filteredList.map((b) => {
      const tx = state.transactions.find(
        (t) =>
          t.date.slice(0, 7) === month &&
          (t.categoryId === b.categoryId ||
            t.description.toLowerCase().includes(b.description.toLowerCase())) &&
          t.type === activeTab &&
          !t.ignored
      );
      return {
        ...b,
        isPaid: !!tx,
        paymentDate: tx ? tx.date : null,
      };
    });
  }, [filteredList, state.transactions, month, activeTab]);

  // Next Month Projection Card math
  const projection = useMemo(() => {
    const nextMonth = shiftMonth(month, 1);
    
    // Expected income = current income + recurring fixed incomes
    const currentIncome = state.transactions
      .filter((t) => t.date.slice(0, 7) === month && t.type === "income" && !t.ignored)
      .reduce((s, t) => s + t.amount, 0);

    const recurringIncomes = rawBills
      .filter((b) => b.type === "income")
      .reduce((s, b) => s + b.amount, 0);

    const expectedIncome = currentIncome || recurringIncomes || 8000;

    // Expected expenses = recurring bills (expenses) + next month card invoices
    const recurringExpenses = rawBills
      .filter((b) => (b.type || "expense") === "expense")
      .reduce((s, b) => s + b.amount, 0);

    const nextMonthCards = state.cards.reduce((sum, c) => sum + cardSpent(state, c.id, nextMonth), 0);
    const expectedExpense = recurringExpenses + nextMonthCards;

    const netForecast = expectedIncome - expectedExpense;

    return {
      nextMonth,
      expectedIncome,
      expectedExpense,
      netForecast,
    };
  }, [state, month, rawBills]);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !desc || !amount) return;

    setBusy(true);
    const parsedAmount = Number(amount.replace(",", "."));
    
    update((s) => {
      if (!s.recurringBills) s.recurringBills = [];
      s.recurringBills.push({
        id: uid("rec"),
        type: activeTab,
        description: desc.trim(),
        amount: parsedAmount,
        dueDay,
        categoryId: catId || activeCategories[0]?.id || "",
        createdAt: new Date().toISOString(),
      });
    });

    setDesc("");
    setAmount("");
    setDueDay(10);
    setShowAdd(false);
    setBusy(false);
  }

  function handleDelete(id: string) {
    if (!window.confirm("Deseja realmente excluir este lançamento recorrente?")) return;
    update((s) => {
      s.recurringBills = (s.recurringBills || []).filter((b) => b.id !== id);
    });
  }

  return (
    <>
      <section className="panel welcome-row">
        <div>
          <h2>Lançamentos Fixos & Recorrência</h2>
          <p className="muted">Gerencie suas despesas e receitas fixas do mês e planeje suas projeções futuras.</p>
        </div>
        <button type="button" className="primary-action" onClick={() => {
          setCatId(activeCategories[0]?.id || "");
          setShowAdd(true);
        }}>
          + Novo Lançamento Fixo
        </button>
      </section>

      {/* Tabs Menu */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, borderBottom: "1px solid var(--line)", paddingBottom: 12 }}>
        <button
          type="button"
          className={`secondary-action ${activeTab === "expense" ? "active-action" : ""}`}
          style={{
            padding: "8px 16px",
            fontWeight: 700,
            background: activeTab === "expense" ? "var(--brand)" : "transparent",
            color: activeTab === "expense" ? "#fff" : "var(--ink)",
            border: activeTab === "expense" ? "none" : "1px solid var(--line)"
          }}
          onClick={() => {
            setActiveTab("expense");
            setShowAdd(false);
          }}
        >
          💸 Contas Fixas (Despesas)
        </button>
        <button
          type="button"
          className={`secondary-action ${activeTab === "income" ? "active-action" : ""}`}
          style={{
            padding: "8px 16px",
            fontWeight: 700,
            background: activeTab === "income" ? "var(--brand)" : "transparent",
            color: activeTab === "income" ? "#fff" : "var(--ink)",
            border: activeTab === "income" ? "none" : "1px solid var(--line)"
          }}
          onClick={() => {
            setActiveTab("income");
            setShowAdd(false);
          }}
        >
          💰 Receitas Fixas (Ganhos)
        </button>
      </div>

      {/* Forecast widget */}
      <section className="metric-grid" style={{ marginTop: 16 }}>
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap">📊</div>
          <div>
            <span>Projeção de Receitas ({projection.nextMonth})</span>
            <h3>{money(projection.expectedIncome)}</h3>
          </div>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon-wrap">📉</div>
          <div>
            <span>Projeção de Despesas ({projection.nextMonth})</span>
            <h3>-{money(projection.expectedExpense)}</h3>
          </div>
        </article>
        <article className={`metric-card balance ${projection.netForecast >= 0 ? "positive" : "negative"}`}>
          <div className="metric-icon-wrap">⚖️</div>
          <div>
            <span>Saldo Líquido Projetado</span>
            <h3 style={{ color: projection.netForecast >= 0 ? "var(--green)" : "var(--red)" }}>
              {money(projection.netForecast)}
            </h3>
          </div>
        </article>
      </section>

      {/* List section */}
      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header" style={{ marginBottom: 16 }}>
          <h2>{activeTab === "expense" ? "Contas Fixas Cadastradas" : "Receitas Fixas Cadastradas"}</h2>
        </div>

        {billsStatus.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>Nenhum lançamento recorrente nesta categoria.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vencimento (Dia)</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Valor Previsto</th>
                  <th>Situação ({month})</th>
                  <th style={{ width: 80 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {billsStatus.map((b) => {
                  const cat = state.categories.find(c => c.id === b.categoryId);
                  return (
                    <tr key={b.id}>
                      <td><strong>Dia {b.dueDay}</strong></td>
                      <td>{b.description}</td>
                      <td>
                        <span className="category-tag" style={{ background: cat?.color || "#64748b" }}>
                          {cat?.name || "Sem categoria"}
                        </span>
                      </td>
                      <td><strong>{money(b.amount)}</strong></td>
                      <td>
                        {b.isPaid ? (
                          <span className="pill success" style={{ fontSize: "0.75rem" }}>
                            {activeTab === "expense" ? "Pago" : "Recebido"} em {b.paymentDate}
                          </span>
                        ) : (
                          <span className="pill danger" style={{ fontSize: "0.75rem" }}>Pendente</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-action"
                          style={{ color: "var(--red)", fontSize: "0.8rem", padding: "4px 8px" }}
                          onClick={() => handleDelete(b.id)}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Modal */}
      {showAdd && (
        <div className="quick-insert-backdrop" onClick={() => setShowAdd(false)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>{activeTab === "expense" ? "Nova Conta Fixa" : "Nova Receita Fixa"}</h2>
              <button type="button" className="close-btn" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <form onSubmit={handleAdd} className="quick-insert-form">
              <div className="form-group">
                <label>Descrição / Nome do Boleto</label>
                <input
                  type="text"
                  placeholder={activeTab === "expense" ? "Ex: Aluguel, Internet, Academia" : "Ex: Salário Mensal, Pensão"}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Valor Previsto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Dia do Vencimento (1 a 31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(e) => setDueDay(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Categoria Correspondente</label>
                <select
                  value={catId}
                  onChange={(e) => setCatId(e.target.value)}
                  required
                >
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="primary-action" disabled={busy} style={{ marginTop: 12 }}>
                Salvar Lançamento Fixo
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
