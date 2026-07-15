import { FormEvent, useState, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid, fmtDate } from "@/lib/format";
import { cardSpent, getTransactionInvoiceMonth, cardPayments, getActiveInvoiceMonth } from "@/domain/finance";
import type { Transaction } from "@/domain/types";

export function CardsPage() {
  const { state, update, addTransaction } = useFinance();
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingInvoicesCardId, setViewingInvoicesCardId] = useState<string | null>(null);
  const [expandedInvoiceMonth, setExpandedInvoiceMonth] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<{ cardId: string; month: string; amount: number } | null>(null);

  if (!state) return null;

  const cardsList = state.cards || [];

  // Group transactions of the selected card by invoice month
  const cardInvoices = useMemo(() => {
    if (!viewingInvoicesCardId) return [];
    
    const groups: Record<string, Transaction[]> = {};
    state.transactions.forEach((t) => {
      if (t.cardId === viewingInvoicesCardId && !t.ignored) {
        const invMonth = getTransactionInvoiceMonth(t, state.cards);
        if (!groups[invMonth]) groups[invMonth] = [];
        groups[invMonth].push(t);
      }
    });

    return Object.keys(groups)
      .sort()
      .map((m) => {
        const txs = groups[m];
        const total = txs.reduce((sum, t) => sum + t.amount, 0);
        return { month: m, total, txs };
      });
  }, [state.transactions, viewingInvoicesCardId, state.cards]);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const brand = String(fd.get("brand") || "Visa");
    const limit = Number(fd.get("limit") || 0);
    const closingDay = Number(fd.get("closingDay") || 5);
    const dueDay = Number(fd.get("dueDay") || 10);
    
    const color1 = String(fd.get("color1") || "#6366f1");
    const color2 = String(fd.get("color2") || "#1e1b4b");
    const color = `${color1},${color2}`;

    if (!name || limit <= 0) return;

    update((s) => {
      s.cards.push({
        id: uid("card"),
        name,
        brand,
        limit,
        closingDay,
        dueDay,
        color,
        accountId: "",
        autoPay: false,
        source: "manual",
      });
    });

    setShowAddForm(false);
    e.currentTarget.reset();
  }

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCard) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const brand = String(fd.get("brand") || "Visa");
    const limit = Number(fd.get("limit") || 0);
    const closingDay = Number(fd.get("closingDay") || 5);
    const dueDay = Number(fd.get("dueDay") || 10);
    
    const color1 = String(fd.get("color1") || "#6366f1");
    const color2 = String(fd.get("color2") || "#1e1b4b");
    const color = `${color1},${color2}`;

    update((s) => {
      const card = s.cards.find((c) => c.id === editingCard.id);
      if (card) {
        card.name = name;
        card.brand = brand;
        card.limit = limit;
        card.closingDay = closingDay;
        card.dueDay = dueDay;
        card.color = color;
      }
    });

    setEditingCard(null);
  }

  function handleRegisterPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payingInvoice) return;
    const fd = new FormData(e.currentTarget);
    const accountId = String(fd.get("accountId") || "");
    const amountVal = Number(fd.get("amount") || 0);
    const dateVal = String(fd.get("date") || "");

    const targetCard = cardsList.find(x => x.id === payingInvoice.cardId);
    if (!targetCard || amountVal <= 0 || !accountId) return;

    addTransaction({
      type: "transfer",
      date: dateVal,
      description: `Pagamento Fatura - ${targetCard.name}`,
      amount: amountVal,
      currency: "BRL",
      accountId,
      cardId: targetCard.id,
      categoryId: "",
      subcategory: "",
      tags: "",
      location: "",
      note: `Pagamento da fatura de ${payingInvoice.month}`,
      recurring: false,
    });

    setPayingInvoice(null);
  }

  function handleDelete(id: string) {
    if (!window.confirm("Deseja realmente excluir este cartão manual?")) return;
    update((s) => {
      s.cards = s.cards.filter((c) => c.id !== id);
      // Desassociar transações deste cartão
      s.transactions.forEach((t) => {
        if (t.cardId === id) t.cardId = "";
      });
    });
    if (viewingInvoicesCardId === id) setViewingInvoicesCardId(null);
  }

  function getMonthLabel(mStr: string) {
    const [y, m] = mStr.split("-").map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  return (
    <>
      <section className="panel welcome-row">
        <div>
          <h2>Meus Cartões de Crédito</h2>
          <p className="muted">Cadastre e gerencie faturas, limites e cores dos seus cartões manuais.</p>
        </div>
        <button type="button" className="primary-action" onClick={() => setShowAddForm((v) => !v)}>
          ➕ Novo Cartão
        </button>
      </section>

      {showAddForm && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Novo Cartão de Crédito</h3>
          <form onSubmit={handleAdd} className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 16 }}>
            <label className="field">
              Nome do Cartão
              <input name="name" required placeholder="Ex: Nubank, Cartão Itaú..." />
            </label>
            <label className="field">
              Bandeira
              <select name="brand">
                <option value="Visa">Visa</option>
                <option value="Mastercard">Mastercard</option>
                <option value="Elo">Elo</option>
                <option value="Amex">Amex</option>
              </select>
            </label>
            <label className="field">
              Limite Total (R$)
              <input name="limit" type="number" step="0.01" required placeholder="0.00" />
            </label>
            <label className="field">
              Dia de Fechamento
              <input name="closingDay" type="number" min={1} max={31} defaultValue={5} required />
            </label>
            <label className="field">
              Dia de Vencimento
              <input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
            </label>
            <label className="field">
              Cor Inicial do Degradê
              <input type="color" name="color1" defaultValue="#6366f1" style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
            </label>
            <label className="field">
              Cor Final do Degradê
              <input type="color" name="color2" defaultValue="#1e1b4b" style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="secondary-action" onClick={() => setShowAddForm(false)}>❌ Cancelar</button>
              <button type="submit" className="primary-action">💾 Adicionar Cartão</button>
            </div>
          </form>
        </section>
      )}

      {editingCard && (
        <div className="quick-insert-backdrop" onClick={() => setEditingCard(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Editar Cartão</h2>
              <button type="button" className="close-btn" onClick={() => setEditingCard(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="quick-insert-form">
              <div className="form-group">
                <label>Nome do Cartão</label>
                <input name="name" required defaultValue={editingCard.name} />
              </div>
              <div className="form-group">
                <label>Bandeira</label>
                <select name="brand" defaultValue={editingCard.brand}>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Elo">Elo</option>
                  <option value="Amex">Amex</option>
                </select>
              </div>
              <div className="form-group">
                <label>Limite Total</label>
                <input name="limit" type="number" step="0.01" required defaultValue={editingCard.limit} />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Dia Fechamento</label>
                  <input name="closingDay" type="number" min={1} max={31} required defaultValue={editingCard.closingDay} />
                </div>
                <div className="form-group">
                  <label>Dia Vencimento</label>
                  <input name="dueDay" type="number" min={1} max={31} required defaultValue={editingCard.dueDay} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Cor Inicial Degradê</label>
                  <input type="color" name="color1" defaultValue={(editingCard.color || "#6366f1").split(",")[0]} style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
                </div>
                <div className="form-group">
                  <label>Cor Final Degradê</label>
                  <input type="color" name="color2" defaultValue={(editingCard.color || "#6366f1,#1e1b4b").split(",")[1] || "#1e1b4b"} style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
                </div>
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>💾 Salvar Alterações</button>
            </form>
          </div>
        </div>
      )}

      {payingInvoice && (
        <div className="quick-insert-backdrop" onClick={() => setPayingInvoice(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>💳 Pagar Fatura</h2>
              <button type="button" className="close-btn" onClick={() => setPayingInvoice(null)}>×</button>
            </div>
            <form onSubmit={handleRegisterPayment} className="quick-insert-form">
              <div className="form-group">
                <label>Cartão</label>
                <input type="text" disabled value={cardsList.find(x => x.id === payingInvoice.cardId)?.name || ""} />
              </div>
              <div className="form-group">
                <label>Fatura Referente</label>
                <input type="text" disabled value={getMonthLabel(payingInvoice.month)} />
              </div>
              <div className="form-group">
                <label>Conta de Origem (Débito)</label>
                <select name="accountId" required>
                  {state.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} (Saldo: {money(acc.balance)})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Valor Pago (R$)</label>
                <input name="amount" type="number" step="0.01" required defaultValue={payingInvoice.amount} />
              </div>
              <div className="form-group">
                <label>Data do Pagamento</label>
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>
                Confirmar Pagamento
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Grid of Credit Cards */}
      <section className="credit-cards-list-widget" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
        {cardsList.map((c) => {
          const limit = c.limit || 0;
          const activeMonth = getActiveInvoiceMonth(state, c);
          const invoice = cardSpent(state, c.id, activeMonth);
          const payments = cardPayments(state, c.id, activeMonth);
          const outstandingInvoice = Math.max(0, invoice - payments);
          const available = limit - outstandingInvoice;
          const usedPct = limit > 0 ? Math.min((outstandingInvoice / limit) * 100, 100) : 0;
          
          // Split gradient colors
          const c1 = (c.color || "#6366f1").split(",")[0];
          const c2 = (c.color || "#6366f1,#1e1b4b").split(",")[1] || "rgba(0, 0, 0, 0.55)";
          const gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
          
          const isViewingInvoices = viewingInvoicesCardId === c.id;

          return (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div onClick={() => setEditingCard(c)} style={{ cursor: "pointer" }}>
                <div className="credit-card-mockup" style={{ background: gradient, boxShadow: "var(--shadow)", borderRadius: "var(--radius-lg)", color: "#fff", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="card-chip-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="card-chip" style={{ width: 40, height: 30, background: "#e2e8f0", borderRadius: 4 }} />
                    <span className="card-brand" style={{ fontWeight: 800, fontSize: "1.1rem" }}>{c.brand || "Visa"}</span>
                  </div>
                  
                  <div className="card-details-row" style={{ marginTop: 8 }}>
                    <div className="card-out-balance" style={{ display: "flex", flexDirection: "column" }}>
                      <span className="card-label" style={{ fontSize: "0.75rem", opacity: 0.7 }}>Saldo Devedor Fatura ({activeMonth})</span>
                      <span className="card-value" style={{ fontSize: "1.8rem", fontWeight: 800, fontFamily: "Sora, sans-serif" }}>{money(outstandingInvoice)}</span>
                    </div>
                  </div>

                  <div className="card-footer-limit" style={{ marginTop: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 6 }}>
                      <span>Limite Disp: {money(available)}</span>
                      <span>Limite: {money(limit)}</span>
                    </div>
                    <div className="limit-progress-bar" style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" }}>
                      <span className="limit-bar-fill" style={{ display: "block", height: "100%", width: `${usedPct}%`, backgroundColor: "#fff" }} />
                    </div>
                    <div className="limit-labels-row" style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", opacity: 0.8, marginTop: 8 }}>
                      <span>Fechamento: dia {c.closingDay} | Vencimento: dia {c.dueDay}</span>
                      <span>{usedPct.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions row for cards */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "0 4px" }}>
                <button
                  type="button"
                  className={`ghost-action ${isViewingInvoices ? "active-action" : ""}`}
                  style={{ fontSize: "0.8rem", padding: "4px 8px", fontWeight: isViewingInvoices ? "bold" : "normal" }}
                  onClick={() => setViewingInvoicesCardId(isViewingInvoices ? null : c.id)}
                >
                  🔍 Ver Faturas
                </button>
                <button type="button" className="ghost-action" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => setEditingCard(c)}>
                  ✏️ Editar
                </button>
                <button type="button" className="ghost-action" style={{ color: "var(--red)", fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => handleDelete(c.id)}>
                  🗑️ Excluir
                </button>
              </div>

              {/* Expandable Invoices Statements Panel */}
              {isViewingInvoices && (
                <div className="panel" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", padding: 16, borderRadius: "var(--radius)", marginTop: 8 }}>
                  <h4 style={{ margin: "0 0 12px 0", color: "var(--ink)" }}>Faturas de {c.name}</h4>
                  
                  {cardInvoices.length === 0 ? (
                    <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>Nenhum lançamento registrado neste cartão.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {cardInvoices.map((inv) => {
                        const isExpanded = expandedInvoiceMonth === inv.month;
                        // Payment Status Math
                        const paid = cardPayments(state, c.id, inv.month);
                        const outstanding = Math.max(0, inv.total - paid);
                        const isPaid = outstanding === 0;

                        return (
                          <div key={inv.month} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                            <div 
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                              onClick={() => setExpandedInvoiceMonth(isExpanded ? null : inv.month)}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "0.9rem", fontWeight: 700, textTransform: "capitalize", color: "var(--ink)" }}>
                                  {getMonthLabel(inv.month)}
                                </span>
                                {isPaid ? (
                                  <span className="pill success" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Paga</span>
                                ) : paid > 0 ? (
                                  <span className="pill warning" style={{ fontSize: "0.65rem", padding: "2px 6px", background: "rgba(245,158,11,0.1)", color: "var(--orange)" }}>Parcial ({money(paid)} pago)</span>
                                ) : (
                                  <span className="pill danger" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Pendente</span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontWeight: 800, color: "var(--ink)", fontSize: "0.9rem" }}>
                                  {money(outstanding)} <small className="muted" style={{ fontWeight: "normal", fontSize: "0.75rem" }}>de {money(inv.total)}</small>
                                </span>
                                
                                {/* Pay Button */}
                                {!isPaid && (
                                  <button
                                    type="button"
                                    className="primary-action"
                                    style={{ fontSize: "0.75rem", padding: "4px 8px", background: "var(--green)", borderColor: "var(--green)" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPayingInvoice({ cardId: c.id, month: inv.month, amount: outstanding });
                                    }}
                                  >
                                    💵 Pagar
                                  </button>
                                )}
                                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                              </div>
                            </div>

                            {/* List of transactions in this invoice */}
                            {isExpanded && (
                              <div style={{ background: "var(--surface)", borderRadius: "var(--radius-xs)", padding: 8, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                {inv.txs.map((t) => (
                                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "4px 0" }}>
                                    <div>
                                      <span className="muted" style={{ marginRight: 8 }}>{fmtDate(t.date)}</span>
                                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{t.description}</span>
                                    </div>
                                    <span style={{ fontWeight: 700, color: "var(--ink)" }}>{money(t.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!cardsList.length && (
          <div className="panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
            <p className="muted">Nenhum cartão cadastrado. Cadastre um novo cartão acima!</p>
          </div>
        )}
      </section>
    </>
  );
}
