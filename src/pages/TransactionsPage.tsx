import { FormEvent, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { getMonthTransactions, monthlyTotals } from "@/domain/finance";
import { fmtDate, money } from "@/lib/format";
import type { TxType, Transaction } from "@/domain/types";

export function TransactionsPage() {
  const { state, deleteTransaction, updateTransaction, setShowQuickInsert, update } = useFinance();
  const [q, setQ] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingGroupTx, setDeletingGroupTx] = useState<Transaction | null>(null);
  const [editAllGroup, setEditAllGroup] = useState(false);
  const [activeEditTab, setActiveEditTab] = useState<"single" | "group">("single");
  const [selectedGroupTxIds, setSelectedGroupTxIds] = useState<string[]>([]);

  if (!state) return null;

  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(state, month);

  const installmentGroupTxs = useMemo(() => {
    if (!editingTx || !editingTx.installmentGroupId) return [];
    return (state.transactions || [])
      .filter((t) => t.installmentGroupId === editingTx.installmentGroupId)
      .sort((a, b) => (a.installmentIndex || 0) - (b.installmentIndex || 0));
  }, [state.transactions, editingTx]);

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

    if (editingTx.installmentGroupId && editAllGroup) {
      update((s) => {
        s.transactions.forEach((t) => {
          if (t.installmentGroupId === editingTx.installmentGroupId) {
            t.type = type;
            t.categoryId = categoryId;
            t.cardId = type === "expense" ? cardId : "";
            t.accountId = type === "expense" && cardId ? "" : accountId;
            
            // Retain the installment index label in descriptions if available
            if (t.installmentIndex && t.installmentTotal) {
              t.description = `${description} (${t.installmentIndex}/${t.installmentTotal})`;
            } else {
              t.description = description;
            }
          }
        });
      });
    } else {
      updateTransaction(editingTx.id, {
        type,
        description,
        amount,
        date,
        accountId: type === "expense" && cardId ? "" : accountId,
        cardId: type === "expense" ? cardId : "",
        categoryId,
      });
    }

    setEditingTx(null);
    setEditAllGroup(false);
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
          <div className="metric-icon-wrap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "rgba(16, 185, 129, 0.1)", borderRadius: "50%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--green)" }}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </div>
          <div>
            <span>Receitas do Mês</span>
            <h3>{money(totals.income)}</h3>
          </div>
        </article>
        <article className="metric-card expense">
          <div className="metric-icon-wrap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "rgba(239, 68, 68, 0.1)", borderRadius: "50%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--red)" }}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          </div>
          <div>
            <span>Despesas do Mês</span>
            <h3>{money(totals.expense)}</h3>
          </div>
        </article>
        <article className={`metric-card balance ${totals.balance >= 0 ? "positive" : "negative"}`}>
          <div className="metric-icon-wrap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "var(--brand-soft)", borderRadius: "50%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--brand)" }}><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
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
            {editingTx.installmentGroupId && (
              <div style={{ display: "flex", gap: 12, marginBottom: 16, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <button
                  type="button"
                  className={`ghost-action ${activeEditTab === "single" ? "active" : ""}`}
                  style={{
                    fontWeight: activeEditTab === "single" ? "bold" : "normal",
                    borderBottom: activeEditTab === "single" ? "2px solid var(--brand)" : "none",
                    padding: "4px 8px",
                    color: activeEditTab === "single" ? "var(--brand)" : "var(--ink)",
                    borderRadius: 0,
                  }}
                  onClick={() => setActiveEditTab("single")}
                >
                  Detalhes do Lançamento
                </button>
                <button
                  type="button"
                  className={`ghost-action ${activeEditTab === "group" ? "active" : ""}`}
                  style={{
                    fontWeight: activeEditTab === "group" ? "bold" : "normal",
                    borderBottom: activeEditTab === "group" ? "2px solid var(--brand)" : "none",
                    padding: "4px 8px",
                    color: activeEditTab === "group" ? "var(--brand)" : "var(--ink)",
                    borderRadius: 0,
                  }}
                  onClick={() => setActiveEditTab("group")}
                >
                  Ver Parcelas ({installmentGroupTxs.length})
                </button>
              </div>
            )}

            {activeEditTab === "single" ? (
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
                {editingTx.installmentGroupId && (
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, margin: "16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--brand)" }}>
                      📦 Detalhes do Parcelamento (Parcela {editingTx.installmentIndex}/{editingTx.installmentTotal})
                    </span>
                    
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer", color: "var(--ink)" }}>
                      <input
                        type="checkbox"
                        name="editAllGroup"
                        checked={editAllGroup}
                        onChange={(e) => setEditAllGroup(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      Aplicar alterações a todas as parcelas deste grupo
                    </label>

                    <button
                      type="button"
                      className="secondary-action small"
                      style={{ fontSize: "0.75rem", padding: "6px 10px", marginTop: 4, width: "fit-content" }}
                      onClick={() => {
                        if (window.confirm("Deseja realmente antecipar todas as parcelas deste grupo para a fatura de " + month + "?")) {
                          update((s) => {
                            s.transactions.forEach((t) => {
                              if (t.installmentGroupId === editingTx.installmentGroupId) {
                                t.invoiceMonth = month;
                              }
                            });
                          });
                          alert("Todas as parcelas foram antecipadas para a fatura de " + month + "!");
                          setEditingTx(null);
                        }
                      }}
                    >
                      ⚡ Antecipar todas as parcelas (Pagar tudo agora)
                    </button>
                  </div>
                )}
                <button type="submit" className="primary-action" style={{ marginTop: 12 }}>Salvar Alterações</button>
              </form>
            ) : (
              <div className="quick-insert-form" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer", color: "var(--ink)" }}>
                    <input
                      type="checkbox"
                      checked={installmentGroupTxs.length > 0 && selectedGroupTxIds.length === installmentGroupTxs.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedGroupTxIds(installmentGroupTxs.map((t) => t.id));
                        } else {
                          setSelectedGroupTxIds([]);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                    Selecionar Todas ({installmentGroupTxs.length})
                  </label>

                  {selectedGroupTxIds.length > 0 && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="ghost-action small"
                        style={{ color: "var(--red)", fontSize: "0.75rem", padding: "4px 8px" }}
                        onClick={() => {
                          if (window.confirm(`Deseja realmente excluir as ${selectedGroupTxIds.length} parcelas selecionadas?`)) {
                            update((s) => {
                              s.transactions = s.transactions.filter((t) => !selectedGroupTxIds.includes(t.id));
                            });
                            alert(`${selectedGroupTxIds.length} parcelas foram excluídas.`);
                            if (selectedGroupTxIds.includes(editingTx.id)) {
                              setEditingTx(null);
                            }
                            setSelectedGroupTxIds([]);
                          }
                        }}
                      >
                        🗑️ Excluir
                      </button>
                      <button
                        type="button"
                        className="ghost-action small"
                        style={{ color: "var(--brand)", fontSize: "0.75rem", padding: "4px 8px" }}
                        onClick={() => {
                          if (window.confirm(`Deseja realmente antecipar as ${selectedGroupTxIds.length} parcelas selecionadas para a fatura de ${month}?`)) {
                            update((s) => {
                              s.transactions.forEach((t) => {
                                if (selectedGroupTxIds.includes(t.id)) {
                                  t.invoiceMonth = month;
                                }
                              });
                            });
                            alert(`${selectedGroupTxIds.length} parcelas foram antecipadas.`);
                            setSelectedGroupTxIds([]);
                          }
                        }}
                      >
                        ⚡ Antecipar
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 6, background: "rgba(0,0,0,0.15)" }}>
                  {installmentGroupTxs.map((t) => {
                    const isSelected = selectedGroupTxIds.includes(t.id);
                    const card = state.cards.find((c) => c.id === t.cardId);
                    
                    return (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "8px 12px",
                          borderBottom: "1px solid var(--line)",
                          background: t.id === editingTx.id ? "rgba(255,255,255,0.03)" : "transparent"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGroupTxIds([...selectedGroupTxIds, t.id]);
                            } else {
                              setSelectedGroupTxIds(selectedGroupTxIds.filter((id) => id !== t.id));
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: t.id === editingTx.id ? 700 : 500, color: t.id === editingTx.id ? "var(--brand)" : "var(--ink)" }}>
                            {t.description}
                          </span>
                          <span style={{ display: "block", fontSize: "0.7rem", color: "var(--muted)" }}>
                            Vence: {fmtDate(t.date)} | 💳 {card?.name || "Sem cartão"} {t.invoiceMonth ? `(Fatura ${t.invoiceMonth})` : ""}
                          </span>
                        </div>

                        <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>
                          {money(t.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {selectedGroupTxIds.length > 0 && (
                  <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 12, borderRadius: 8, marginTop: 8 }}>
                    <h4 style={{ margin: 0, fontSize: "0.85rem", color: "var(--brand)" }}>Editar Selecionadas em Lote</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: "0.75rem" }}>Descrição Base</label>
                        <input type="text" id="bulkDesc" placeholder="Ex: Mercado" style={{ padding: "6px 8px", fontSize: "0.8rem", height: "auto", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 4 }} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: "0.75rem" }}>Valor da Parcela (R$)</label>
                        <input type="number" id="bulkAmount" placeholder="Ex: 50.00" step="0.01" style={{ padding: "6px 8px", fontSize: "0.8rem", height: "auto", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 4 }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="primary-action small"
                      style={{ marginTop: 12, width: "100%", fontSize: "0.8rem", padding: "6px 12px" }}
                      onClick={() => {
                        const descInput = document.getElementById("bulkDesc") as HTMLInputElement;
                        const amountInput = document.getElementById("bulkAmount") as HTMLInputElement;
                        
                        const newDesc = descInput?.value.trim();
                        const newAmount = amountInput?.value ? Number(amountInput.value) : null;
                        
                        if (!newDesc && !newAmount) {
                          alert("Por favor, preencha pelo menos um campo para editar.");
                          return;
                        }

                        update((s) => {
                          s.transactions.forEach((t) => {
                            if (selectedGroupTxIds.includes(t.id)) {
                              if (newDesc) {
                                if (t.installmentIndex && t.installmentTotal) {
                                  t.description = `${newDesc} (${t.installmentIndex}/${t.installmentTotal})`;
                                } else {
                                  t.description = newDesc;
                                }
                              }
                              if (newAmount !== null && !isNaN(newAmount)) {
                                t.amount = newAmount;
                              }
                            }
                          });
                        });

                        alert("Parcelas atualizadas com sucesso!");
                        if (descInput) descInput.value = "";
                        if (amountInput) amountInput.value = "";
                        setSelectedGroupTxIds([]);
                      }}
                    >
                      Confirmar Alterações em Lote
                    </button>
                  </div>
                )}
              </div>
            )}
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
                      <button type="button" className="ghost-action" onClick={() => {
                        setEditingTx(t);
                        setActiveEditTab("single");
                        setSelectedGroupTxIds([]);
                      }}>Editar</button>
                      <button type="button" className="ghost-action" style={{ color: "var(--red)" }} onClick={() => {
                        if (t.installmentGroupId) {
                          setDeletingGroupTx(t);
                        } else {
                          if (window.confirm("Tem certeza que deseja excluir este lançamento?")) {
                            deleteTransaction(t.id);
                          }
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

      {deletingGroupTx && (
        <div className="quick-insert-backdrop" onClick={() => setDeletingGroupTx(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Excluir Compra Parcelada</h2>
              <button type="button" className="close-btn" onClick={() => setDeletingGroupTx(null)}>×</button>
            </div>
            <div style={{ padding: "8px 0" }}>
              <p style={{ color: "var(--ink)" }}>
                O lançamento <strong>{deletingGroupTx.description}</strong> faz parte de uma compra parcelada.
              </p>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                Deseja excluir apenas esta parcela ou todo o parcelamento (todas as parcelas)?
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="primary-action"
                style={{ background: "var(--red)", border: "none", display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}
                onClick={() => {
                  update((s) => {
                    s.transactions = s.transactions.filter(
                      (x) => x.installmentGroupId !== deletingGroupTx.installmentGroupId
                    );
                  });
                  setDeletingGroupTx(null);
                }}
              >
                🗑️ Excluir Todo o Parcelamento
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  deleteTransaction(deletingGroupTx.id);
                  setDeletingGroupTx(null);
                }}
              >
                Excluir Apenas Esta Parcela
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={() => setDeletingGroupTx(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
