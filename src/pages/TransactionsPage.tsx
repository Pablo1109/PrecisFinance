import { FormEvent, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { getMonthTransactions, monthlyTotals } from "@/domain/finance";
import { fmtDate, money } from "@/lib/format";
import type { TxType, Transaction } from "@/domain/types";

export function TransactionsPage() {
  const { state, deleteTransaction, updateTransaction, setShowQuickInsert } = useFinance();
  const [q, setQ] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  if (!state) return null;

  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(state, month);

  const rows = useMemo(() => {
    return getMonthTransactions(state, month).filter((t) => {
      if (!q) return true;
      const hay = `${t.description} ${t.tags} ${t.note}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [state, month, q]);

  function onEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingTx) return;
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as TxType;
    const description = String(fd.get("description") || "");
    const amount = Number(fd.get("amount"));
    const date = String(fd.get("date"));
    const accountId = String(fd.get("accountId") || "");
    const cardId = String(fd.get("cardId") || "");
    const categoryId = String(fd.get("categoryId") || "");

    updateTransaction(editingTx.id, {
      type,
      description,
      amount,
      date,
      accountId: type === "expense" && cardId ? "" : accountId,
      cardId: type === "expense" ? cardId : "",
      categoryId,
    });

    setEditingTx(null);
  }

  return (
    <>
      <section className="panel welcome-row">
        <div>
          <h2>Lançamentos</h2>
          <p className="muted">Gerencie e busque suas despesas manuais, receitas e compras em cartão de crédito.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <input 
            type="search" 
            placeholder="Buscar lançamentos…" 
            value={q} 
            onChange={(e) => setQ(e.target.value)} 
            style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", width: 220 }} 
          />
          <button type="button" className="primary-action" onClick={() => setShowQuickInsert(true)}>
            + Novo Lançamento
          </button>
        </div>
      </section>

      {/* Metrics Row */}
      <section className="metric-grid" style={{ marginTop: 16 }}>
        <article className="metric-card income">
          <div className="metric-icon-wrap">📈</div>
          <div>
            <span>Receitas do Mês</span>
            <h3>{money(totals.income)}</h3>
          </div>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon-wrap">📉</div>
          <div>
            <span>Despesas do Mês</span>
            <h3>{money(totals.expense)}</h3>
          </div>
        </article>
        <article className={`metric-card balance ${totals.balance >= 0 ? "positive" : "negative"}`}>
          <div className="metric-icon-wrap">⚖️</div>
          <div>
            <span>Saldo Líquido</span>
            <h3 style={{ color: totals.balance >= 0 ? "var(--green)" : "var(--red)" }}>{money(totals.balance)}</h3>
          </div>
        </article>
      </section>

      {editingTx && (
        <div className="quick-insert-backdrop" onClick={() => setEditingTx(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Editar Lançamento</h2>
              <button type="button" className="close-btn" onClick={() => setEditingTx(null)}>×</button>
            </div>
            <form onSubmit={onEditSubmit} className="quick-insert-form">
              <div className="form-group">
                <label>Tipo</label>
                <select name="type" defaultValue={editingTx.type}>
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                  <option value="transfer">Transferência</option>
                </select>
              </div>
              <div className="form-group">
                <label>Data</label>
                <input name="date" type="date" required defaultValue={editingTx.date} />
              </div>
              <div className="form-group">
                <label>Descrição</label>
                <input name="description" required defaultValue={editingTx.description} />
              </div>
              <div className="form-group">
                <label>Valor</label>
                <input name="amount" type="number" step="0.01" min="0.01" required defaultValue={editingTx.amount} />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Conta</label>
                  <select name="accountId" defaultValue={editingTx.accountId || ""}>
                    <option value="">—</option>
                    {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Cartão</label>
                  <select name="cardId" defaultValue={editingTx.cardId || ""}>
                    <option value="">—</option>
                    {state.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <select name="categoryId" defaultValue={editingTx.categoryId || ""}>
                  <option value="">—</option>
                  {state.categories.filter((c) => c.type === (editingTx.type === "expense" ? "expense" : "income")).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>Salvar Alterações</button>
            </form>
          </div>
        </div>
      )}

      <section className="table-wrap" style={{ marginTop: 20 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Conta/Cartão</th>
              <th>Valor</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const cat = state.categories.find((c) => c.id === t.categoryId);
              const acc = state.accounts.find((a) => a.id === t.accountId);
              const card = state.cards.find((c) => c.id === t.cardId);
              
              return (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td>
                    <strong>{t.description}</strong>
                    {t.note && <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>{t.note}</span>}
                  </td>
                  <td>
                    <span className="category-tag" style={{ background: cat?.color || "#64748b" }}>
                      {cat?.name || "—"}
                    </span>
                  </td>
                  <td>
                    {card ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: card.color.split(",")[0] || "#6366f1" }} />
                        💳 {card.name}
                      </span>
                    ) : acc ? (
                      `🏦 ${acc.name}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ fontWeight: 800, fontFamily: "Sora, sans-serif", color: t.type === "income" ? "var(--green)" : "inherit" }}>
                    {t.type === "income" ? "+" : "-"} {money(t.amount)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="ghost-action" onClick={() => setEditingTx(t)}>Editar</button>
                      <button type="button" className="ghost-action" style={{ color: "var(--red)" }} onClick={() => {
                        if (window.confirm("Tem certeza que deseja excluir este lançamento?")) {
                          deleteTransaction(t.id);
                        }
                      }}>Excluir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Nenhum lançamento neste mês.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
