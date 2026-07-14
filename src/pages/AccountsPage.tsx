import { FormEvent, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid } from "@/lib/format";

export function AccountsPage() {
  const { state, update } = useFinance();
  const [editingAcc, setEditingAcc] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  if (!state) return null;

  // Calculate total balance of checking/savings accounts
  const totalBalance = state.accounts.reduce((sum, a) => sum + a.balance, 0);

  function addAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const type = String(fd.get("type") || "Conta corrente");
    const balance = Number(fd.get("balance") || 0);
    const color = String(fd.get("color") || "#176b5b");

    if (!name) return;

    update((s) => {
      s.accounts.push({
        id: uid("acc"),
        name,
        type,
        currency: "BRL",
        balance,
        color,
        source: "manual",
      });
    });
    
    setShowAddForm(false);
    e.currentTarget.reset();
  }

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingAcc) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const type = String(fd.get("type") || "Conta corrente");
    const balance = Number(fd.get("balance") || 0);
    const color = String(fd.get("color") || "#176b5b");

    update((s) => {
      const acc = s.accounts.find((a) => a.id === editingAcc.id);
      if (acc) {
        acc.name = name;
        acc.type = type;
        acc.balance = balance;
        acc.color = color;
      }
    });

    setEditingAcc(null);
  }

  function handleDelete(id: string) {
    if (!window.confirm("Deseja realmente excluir esta conta manual?")) return;
    update((s) => {
      s.accounts = s.accounts.filter((a) => a.id !== id);
      // Remove transaction associations
      s.transactions.forEach((t) => {
        if (t.accountId === id) t.accountId = "";
      });
    });
  }

  return (
    <>
      <section className="panel welcome-row">
        <div>
          <h2>Contas Bancárias</h2>
          <p className="muted">Gerencie suas contas correntes, poupanças e saldos consolidados.</p>
        </div>
        <button type="button" className="primary-action" onClick={() => setShowAddForm((v) => !v)}>
          + Nova Conta
        </button>
      </section>

      {/* Metrics Row */}
      <section className="metric-grid" style={{ marginTop: 16 }}>
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap">⚖️</div>
          <div>
            <span>Saldo Consolidado das Contas</span>
            <h3>{money(totalBalance)}</h3>
          </div>
        </article>
        <article className="metric-card income">
          <div className="metric-icon-wrap">🏦</div>
          <div>
            <span>Contas Ativas</span>
            <h3>{state.accounts.length} contas</h3>
          </div>
        </article>
      </section>

      {showAddForm && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Nova Conta Bancária</h3>
          <form onSubmit={addAccount} className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 16 }}>
            <label className="field">
              Nome da Conta / Banco
              <input name="name" required placeholder="Ex: Nubank, Sicredi, Dinheiro..." />
            </label>
            <label className="field">
              Tipo de Conta
              <select name="type">
                <option value="Conta corrente">Conta Corrente</option>
                <option value="Poupança">Poupança</option>
                <option value="Carteira / Dinheiro">Carteira / Dinheiro</option>
                <option value="Outros">Outros</option>
              </select>
            </label>
            <label className="field">
              Saldo Inicial (R$)
              <input name="balance" type="number" step="0.01" defaultValue={0} placeholder="0,00" required />
            </label>
            <label className="field">
              Cor de Destaque
              <input type="color" name="color" defaultValue="#176b5b" style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button type="button" className="secondary-action" onClick={() => setShowAddForm(false)}>Cancelar</button>
              <button type="submit" className="primary-action">Adicionar Conta</button>
            </div>
          </form>
        </section>
      )}

      {editingAcc && (
        <div className="quick-insert-backdrop" onClick={() => setEditingAcc(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Editar Conta</h2>
              <button type="button" className="close-btn" onClick={() => setEditingAcc(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="quick-insert-form">
              <div className="form-group">
                <label>Nome da Conta</label>
                <input name="name" required defaultValue={editingAcc.name} />
              </div>
              <div className="form-group">
                <label>Tipo de Conta</label>
                <select name="type" defaultValue={editingAcc.type}>
                  <option value="Conta corrente">Conta Corrente</option>
                  <option value="Poupança">Poupança</option>
                  <option value="Carteira / Dinheiro">Carteira / Dinheiro</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>
              <div className="form-group">
                <label>Saldo Atual</label>
                <input name="balance" type="number" step="0.01" required defaultValue={editingAcc.balance} />
              </div>
              <div className="form-group">
                <label>Cor de Destaque</label>
                <input type="color" name="color" defaultValue={editingAcc.color || "#176b5b"} style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>Salvar Alterações</button>
            </form>
          </div>
        </div>
      )}

      <section className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20, marginTop: 24 }}>
        {state.accounts.map((a) => {
          const isPluggy = a.source === "pluggy";
          
          return (
            <article 
              key={a.id} 
              className="panel" 
              style={{ 
                borderTop: `6px solid ${a.color}`,
                boxShadow: "var(--shadow-sm)",
                borderRadius: "var(--radius)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{a.name}</h3>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>{a.type}</span>
                </div>
                {isPluggy && <span className="pill success" style={{ fontSize: "0.6rem", padding: "2px 6px" }}>Open Finance</span>}
              </div>
              
              <div style={{ fontSize: "1.6rem", fontWeight: 800, fontFamily: "Sora, sans-serif", color: "var(--ink)", marginTop: 8 }}>
                {money(a.balance, a.currency)}
              </div>

              {!isPluggy && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <button type="button" className="ghost-action" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => setEditingAcc(a)}>
                    ✏️ Editar
                  </button>
                  <button type="button" className="ghost-action" style={{ color: "var(--red)", fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => handleDelete(a.id)}>
                    🗑️ Excluir
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!state.accounts.length && (
          <div className="panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
            <p className="muted">Nenhuma conta bancária cadastrada.</p>
          </div>
        )}
      </section>
    </>
  );
}
