import { FormEvent, useMemo, useState, useEffect } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money } from "@/lib/format";
import { cardSpent, shiftMonth, getBillStartMonth } from "@/domain/finance";
import { uid } from "@/lib/format";

type RecurrenceTab = "expense" | "income";

export function FixedBillsPage() {
  const { state, update, addTransaction } = useFinance();
  
  const [activeTab, setActiveTab] = useState<RecurrenceTab>("expense");
  const [showAdd, setShowAdd] = useState(false);
  const [editingBill, setEditingBill] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  // States for paying/receiving a bill
  const [payingBill, setPayingBill] = useState<any | null>(null);
  const [payAccount, setPayAccount] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");

  // Form states for adding
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
    return filteredList
      .filter((b) => {
        const startMonth = getBillStartMonth(b);
        return month >= startMonth;
      })
      .map((b) => {
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
    
    // Saldo atual de todas as contas
    const currentBankBalance = state.accounts.reduce((sum, a) => sum + a.balance, 0);

    // Receitas fixas (incomes)
    const recurringIncomes = rawBills
      .filter((b) => b.type === "income")
      .reduce((s, b) => s + b.amount, 0);

    // Despesas fixas (recurring bills)
    const recurringExpenses = rawBills
      .filter((b) => (b.type || "expense") === "expense")
      .reduce((s, b) => s + b.amount, 0);

    // Cartões do próximo mês (inclui parcelados)
    const nextMonthCards = state.cards.reduce((sum, c) => sum + cardSpent(state, c.id, nextMonth), 0);
    const expectedExpense = recurringExpenses + nextMonthCards;

    // Saldo final projetado = Saldo Atual + Receitas Fixas - Despesas Fixas - Fatura do Cartão
    const netForecast = currentBankBalance + recurringIncomes - expectedExpense;

    return {
      nextMonth,
      currentBankBalance,
      recurringIncomes,
      expectedExpense,
      netForecast,
    };
  }, [state, month, rawBills]);

  useEffect(() => {
    if (payingBill) {
      setPayAccount(state.accounts[0]?.id || "");
      setPayAmount(String(payingBill.amount));
      
      const currentYearMonth = month;
      const dayStr = String(payingBill.dueDay).padStart(2, "0");
      setPayDate(`${currentYearMonth}-${dayStr}`);
    }
  }, [payingBill, month, state.accounts]);

  function handlePaySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payingBill) return;

    const parsedAmount = Number(payAmount);
    if (!parsedAmount || parsedAmount <= 0) return;

    addTransaction({
      type: activeTab,
      date: payDate,
      description: payingBill.description,
      amount: parsedAmount,
      currency: "BRL",
      accountId: payAccount,
      cardId: "",
      categoryId: payingBill.categoryId,
      subcategory: "",
      tags: "Contas Fixas",
      location: "",
      note: `Pagamento da conta fixa "${payingBill.description}"`,
      recurring: false,
    });

    setPayingBill(null);
  }

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

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingBill) return;
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get("description") || "").trim();
    const amountVal = Number(fd.get("amount"));
    const dueDayVal = Number(fd.get("dueDay"));
    const categoryId = String(fd.get("categoryId") || "");

    update((s) => {
      const b = (s.recurringBills || []).find((x) => x.id === editingBill.id);
      if (b) {
        b.description = description;
        b.amount = amountVal;
        b.dueDay = dueDayVal;
        b.categoryId = categoryId;
      }
    });

    setEditingBill(null);
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
          ➕ Novo Lançamento Fixo
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
            color: activeTab === "expense" ? "var(--surface)" : "var(--ink)",
            border: activeTab === "expense" ? "none" : "1px solid var(--line)"
          }}
          onClick={() => {
            setActiveTab("expense");
            setShowAdd(false);
          }}
        >
          Contas Fixas (Despesas)
        </button>
        <button
          type="button"
          className={`secondary-action ${activeTab === "income" ? "active-action" : ""}`}
          style={{
            padding: "8px 16px",
            fontWeight: 700,
            background: activeTab === "income" ? "var(--brand)" : "transparent",
            color: activeTab === "income" ? "var(--surface)" : "var(--ink)",
            border: activeTab === "income" ? "none" : "1px solid var(--line)"
          }}
          onClick={() => {
            setActiveTab("income");
            setShowAdd(false);
          }}
        >
          Receitas Fixas (Ganhos)
        </button>
      </div>

      {/* Forecast widget with Account Cash Balance incorporated */}
      <section className="metric-grid" style={{ marginTop: 16 }}>
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div>
            <span>Saldo Atual das Contas</span>
            <h3>{money(projection.currentBankBalance)}</h3>
          </div>
        </article>
        <article className="metric-card income">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </div>
          <div>
            <span>Projeção de Receitas ({projection.nextMonth})</span>
            <h3>+{money(projection.recurringIncomes)}</h3>
          </div>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>
          </div>
          <div>
            <span>Projeção de Despesas ({projection.nextMonth})</span>
            <h3>-{money(projection.expectedExpense)}</h3>
          </div>
        </article>
        <article className={`metric-card balance ${projection.netForecast >= 0 ? "positive" : "negative"}`}>
          <div className="metric-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M5 7h14"/><path d="M9 21h6"/><path d="M5 7L3 13h4L5 7z"/><path d="M19 7L17 13h4l-2-7z"/></svg>
          </div>
          <div>
            <span>Saldo Final Projetado ({projection.nextMonth})</span>
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
                  <th style={{ width: 180, textAlign: "right" }}>Ações</th>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="pill danger" style={{ fontSize: "0.75rem" }}>Pendente</span>
                            <button
                              type="button"
                              className="primary-action small"
                              style={{ padding: "4px 8px", fontSize: "0.75rem", minHeight: "auto" }}
                              onClick={() => setPayingBill(b)}
                            >
                              {activeTab === "expense" ? "Pagar" : "Receber"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="ghost-action"
                            style={{ fontSize: "0.8rem", padding: "4px 8px" }}
                            onClick={() => setEditingBill(b)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="ghost-action"
                            style={{ color: "var(--red)", fontSize: "0.8rem", padding: "4px 8px" }}
                            onClick={() => handleDelete(b.id)}
                          >
                            Excluir
                          </button>
                        </div>
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
              <h2>{activeTab === "expense" ? "➕ Nova Conta Fixa" : "➕ Nova Receita Fixa"}</h2>
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
                Salvar Recorrência
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBill && (
        <div className="quick-insert-backdrop" onClick={() => setEditingBill(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Editar Lançamento Fixo</h2>
              <button type="button" className="close-btn" onClick={() => setEditingBill(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="quick-insert-form">
              <div className="form-group">
                <label>Descrição</label>
                <input
                  name="description"
                  required
                  defaultValue={editingBill.description}
                />
              </div>
              <div className="form-group">
                <label>Valor Previsto (R$)</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={editingBill.amount}
                />
              </div>
              <div className="form-group">
                <label>Dia do Vencimento (1 a 31)</label>
                <input
                  name="dueDay"
                  type="number"
                  min={1}
                  max={31}
                  required
                  defaultValue={editingBill.dueDay}
                />
              </div>
              <div className="form-group">
                <label>Categoria Correspondente</label>
                <select
                  name="categoryId"
                  defaultValue={editingBill.categoryId}
                  required
                >
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>
                Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pay Bill Modal */}
      {payingBill && (
        <div className="quick-insert-backdrop" onClick={() => setPayingBill(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>{activeTab === "expense" ? "💵 Pagar Conta Fixa" : "💵 Receber Lançamento Fixo"}</h2>
              <button type="button" className="close-btn" onClick={() => setPayingBill(null)}>×</button>
            </div>
            <form onSubmit={handlePaySubmit} className="quick-insert-form">
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>Lançamento: <strong>{payingBill.description}</strong></p>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem" }}>Valor Base: <strong>{money(payingBill.amount)}</strong></p>
              </div>

              <div className="form-group">
                <label>{activeTab === "expense" ? "Conta de Origem (Pagamento)" : "Conta de Destino (Recebimento)"}</label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value)}
                  required
                >
                  <option value="" disabled>Selecione uma conta...</option>
                  {state.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Saldo: {money(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Valor Pago / Recebido</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Data de Pagamento</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button type="button" className="secondary-action" onClick={() => setPayingBill(null)} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="primary-action" style={{ flex: 1 }}>
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
