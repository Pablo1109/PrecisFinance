import { FormEvent, useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid } from "@/lib/format";
import { Link } from "react-router-dom";

export function InvestmentsPage() {
  const { state, update, addInvestment, deleteInvestment } = useFinance();
  if (!state) return null;

  // Group and calculate totals
  const investmentsList = state.investments || [];
  
  const totalValue = useMemo(() => {
    return investmentsList.reduce((acc, inv) => acc + (inv.balance || 0), 0);
  }, [investmentsList]);

  const groups = useMemo(() => {
    const map: Record<string, { name: string; total: number; color: string; items: typeof investmentsList }> = {
      caixinhas: { name: "Caixinhas & Poupança", total: 0, color: "#8b5cf6", items: [] },
      fixed_income: { name: "Renda Fixa (CDB, Tesouro, LCI)", total: 0, color: "#3b82f6", items: [] },
      variable_income: { name: "Renda Variável (Ações, ETFs, FIIs)", total: 0, color: "#10b981", items: [] },
      others: { name: "Outros Investimentos", total: 0, color: "#64748b", items: [] },
    };

    investmentsList.forEach((inv) => {
      const typeLower = (inv.type || "").toLowerCase();
      const subtypeLower = (inv.subtype || "").toLowerCase();

      let targetGroup = "others";
      if (typeLower.includes("caixinha") || typeLower.includes("space") || subtypeLower.includes("caixinha")) {
        targetGroup = "caixinhas";
      } else if (
        typeLower.includes("fixed") || 
        typeLower.includes("fixa") || 
        typeLower.includes("security") || 
        typeLower.includes("cdb") || 
        typeLower.includes("tesouro") ||
        subtypeLower.includes("fixed") ||
        subtypeLower.includes("cdb")
      ) {
        targetGroup = "fixed_income";
      } else if (
        typeLower.includes("equity") || 
        typeLower.includes("etf") || 
        typeLower.includes("acao") || 
        typeLower.includes("ações") || 
        typeLower.includes("fii") ||
        subtypeLower.includes("equity")
      ) {
        targetGroup = "variable_income";
      }

      map[targetGroup].items.push(inv);
      map[targetGroup].total += inv.balance || 0;
    });

    return Object.entries(map)
      .map(([key, value]) => ({ key, ...value }))
      .filter((g) => g.items.length > 0 || g.total > 0);
  }, [investmentsList]);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const type = String(fd.get("type") || "Renda Fixa");
    const subtype = String(fd.get("subtype") || "").trim();
    const balance = Number(fd.get("balance") || 0);

    if (!name || balance <= 0) return;

    if (addInvestment) {
      addInvestment({
        name,
        type,
        subtype: subtype || "Outros",
        balance,
        currency: "BRL",
        source: "manual",
      });
    } else {
      // Fallback update
      update((s) => {
        if (!s.investments) s.investments = [];
        s.investments.push({
          id: uid("inv"),
          name,
          type,
          subtype: subtype || "Outros",
          balance,
          currency: "BRL",
          source: "manual",
        });
      });
    }

    e.currentTarget.reset();
  }

  return (
    <>
      {/* Notice to sync or add manual */}
      <section className="panel" style={{ marginBottom: 20, background: "rgba(59, 130, 246, 0.04)", borderColor: "rgba(59, 130, 246, 0.15)", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            💡 Seus investimentos do Open Finance não estão batendo? Bancos podem demorar alguns minutos para carregar dados novos. Tente rodar uma sincronização manual.
          </p>
          <Link to="/open-finance" className="primary-action" style={{ fontSize: "0.82rem", padding: "8px 14px", minHeight: "auto" }}>
            ↻ Sincronizar Open Finance
          </Link>
        </div>
      </section>

      {/* Portfolio Header Cards */}
      <section className="metric-grid">
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap">💰</div>
          <div>
            <span>Total Investido</span>
            <strong>{money(totalValue)}</strong>
          </div>
        </article>
        <article className="metric-card income">
          <div className="metric-icon-wrap">📈</div>
          <div>
            <span>Rendimento Estimado</span>
            <strong>{money(totalValue * 0.009)} <small style={{ display: "inline", fontSize: "0.8rem", color: "var(--green)" }}>/mês (0.9%)</small></strong>
          </div>
        </article>
      </section>

      <section className="dashboard-bento" style={{ marginTop: 24 }}>
        {/* Left Bento: Asset Allocation & Add Manual */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Allocation Widget */}
          <article className="panel bento-card">
            <div className="panel-header">
              <h2>Distribuição da Carteira</h2>
            </div>
            {totalValue > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
                {/* Distribution Bar */}
                <div style={{ height: 16, display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                  {groups.map((g) => {
                    const pct = (g.total / totalValue) * 100;
                    return (
                      <span
                        key={g.key}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: g.color,
                          height: "100%",
                          display: "inline-block",
                          transition: "width 0.3s ease",
                        }}
                        title={`${g.name}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>

                {/* Allocation List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {groups.map((g) => {
                    const pct = (g.total / totalValue) * 100;
                    return (
                      <div key={g.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.9rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: g.color }} />
                          <span className="legend-name">{g.name}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <span style={{ color: "var(--muted)" }}>{pct.toFixed(1)}%</span>
                          <strong>{money(g.total)}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>Nenhum investimento registrado para calcular distribuição.</p>
            )}
          </article>

          {/* Form to add manual */}
          <article className="panel bento-card">
            <div className="panel-header">
              <h2>Adicionar Investimento Manual</h2>
            </div>
            <form onSubmit={handleAdd} className="quick-insert-form" style={{ marginTop: 12 }}>
              <div className="form-group">
                <label>Nome do Ativo</label>
                <input name="name" required placeholder="Ex: Caixinha Reserva de Emergência, CDB Itaú..." />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Tipo</label>
                  <select name="type">
                    <option value="Caixinhas">Caixinha / Poupança</option>
                    <option value="Renda Fixa">Renda Fixa (CDB, Tesouro...)</option>
                    <option value="Renda Variável">Renda Variável (Ações, FIIs...)</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Subtipo (Opcional)</label>
                  <input name="subtype" placeholder="Ex: CDB 100% CDI, IPCA+" />
                </div>
              </div>
              <div className="form-group">
                <label>Saldo Atual</label>
                <input name="balance" type="number" step="0.01" min="0.01" required placeholder="0.00" />
              </div>
              <button type="submit" className="primary-action" style={{ marginTop: 12 }}>Salvar Ativo</button>
            </form>
          </article>
        </div>

        {/* Right Bento: Investments list */}
        <article className="panel bento-card">
          <div className="panel-header">
            <h2>Meus Ativos ({investmentsList.length})</h2>
          </div>
          {investmentsList.length > 0 ? (
            <div className="accounts-list-widget" style={{ marginTop: 12 }}>
              {investmentsList.map((inv) => {
                const isPluggy = inv.source === "pluggy";
                
                // Icon/color code by type
                let typeColor = "#64748b";
                let typeIcon = "💼";
                const typeLower = (inv.type || "").toLowerCase();
                const subtypeLower = (inv.subtype || "").toLowerCase();

                if (typeLower.includes("caixinha") || typeLower.includes("space") || subtypeLower.includes("caixinha")) {
                  typeColor = "#8b5cf6";
                  typeIcon = "📦";
                } else if (typeLower.includes("fixa") || typeLower.includes("security") || typeLower.includes("cdb") || typeLower.includes("tesouro") || subtypeLower.includes("cdb")) {
                  typeColor = "#3b82f6";
                  typeIcon = "🛡️";
                } else if (typeLower.includes("equity") || typeLower.includes("etf") || typeLower.includes("acao") || typeLower.includes("ações") || typeLower.includes("fii")) {
                  typeColor = "#10b981";
                  typeIcon = "📈";
                }

                return (
                  <div key={inv.id} className="account-row-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="account-details">
                      <span 
                        style={{ 
                          display: "grid", 
                          placeItems: "center", 
                          width: 32, 
                          height: 32, 
                          borderRadius: 8, 
                          backgroundColor: `${typeColor}15`, 
                          color: typeColor,
                          fontSize: "1.1rem"
                        }}
                      >
                        {typeIcon}
                      </span>
                      <div>
                        <strong>{inv.name}</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                          {inv.type} · {inv.subtype} {isPluggy && <span className="of-pill">OF</span>}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <strong className="account-balance-value">{money(inv.balance)}</strong>
                      {!isPluggy && (
                        <button
                          type="button"
                          className="close-btn"
                          onClick={() => {
                            if (deleteInvestment) {
                              deleteInvestment(inv.id);
                            } else {
                              update((s) => {
                                s.investments = s.investments.filter((i) => i.id !== inv.id);
                              });
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--muted)",
                            fontSize: "1.1rem",
                            cursor: "pointer",
                            padding: 2,
                            lineHeight: 1
                          }}
                          title="Excluir ativo"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="chart-empty-state" style={{ marginTop: 24 }}>
              <div className="empty-chart-icon">💰</div>
              <p className="muted" style={{ marginBottom: 16 }}>Nenhum investimento registrado. Sincronize seu Open Finance ou adicione um investimento manual!</p>
              <Link to="/open-finance" className="secondary-action">Ir para Open Finance</Link>
            </div>
          )}
        </article>
      </section>
    </>
  );
}
