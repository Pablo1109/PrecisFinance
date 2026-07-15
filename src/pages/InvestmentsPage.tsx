import { FormEvent, useMemo, useState, useEffect } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid } from "@/lib/format";
import type { Investment } from "@/domain/types";

export function InvestmentsPage() {
  const { state, update, addInvestment, deleteInvestment, updateInvestment } = useFinance();
  
  // State for index rates loaded from the BCB
  const [rates, setRates] = useState({ cdi: 14.15, ipca: 4.64, selic: 14.25 });
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);

  // Fetch live index rates from BCB on mount
  useEffect(() => {
    let active = true;
    
    // CDI
    fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json")
      .then((res) => res.json())
      .then((data) => {
        if (active && data && data[0]?.valor) {
          const val = parseFloat(data[0].valor);
          setRates((prev) => ({ ...prev, cdi: val, selic: +(val + 0.10).toFixed(2) }));
          setRatesLoaded(true);
        }
      })
      .catch(() => {});

    // IPCA
    fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json")
      .then((res) => res.json())
      .then((data) => {
        if (active && data && data[0]?.valor) {
          setRates((prev) => ({ ...prev, ipca: parseFloat(data[0].valor) }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (!state) return null;

  const investmentsList = state.investments || [];
  
  // Group and calculate totals
  const totalValue = useMemo(() => {
    return investmentsList.reduce((acc, inv) => acc + (inv.balance || 0), 0);
  }, [investmentsList]);

  // Exact yield calculation helper
  function calculateMonthlyYield(inv: Investment) {
    if (!inv.yieldRate || !inv.yieldType) return 0;
    
    let annualRate = 0;
    const cdiDec = rates.cdi / 100;
    const selicDec = rates.selic / 100;
    const ipcaDec = rates.ipca / 100;
    const rateDec = inv.yieldRate / 100;

    if (inv.yieldType === "cdi") {
      annualRate = cdiDec * rateDec;
    } else if (inv.yieldType === "selic") {
      annualRate = selicDec * rateDec;
    } else if (inv.yieldType === "pre") {
      annualRate = rateDec;
    } else if (inv.yieldType === "ipca") {
      annualRate = (1 + ipcaDec) * (1 + rateDec) - 1;
    }

    // Monthly compound interest rate
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    return (inv.balance || 0) * monthlyRate;
  }

  // Calculate dynamic monthly yield total
  const estimatedMonthlyYield = useMemo(() => {
    return investmentsList.reduce((acc, inv) => {
      if (inv.yieldRate && inv.yieldType) {
        return acc + calculateMonthlyYield(inv);
      }
      // Conservative default yields if not configured
      const defaultRate = inv.type === "Renda Variável" ? 0.006 : 0.004; // 0.6% or 0.4%
      return acc + (inv.balance || 0) * defaultRate;
    }, 0);
  }, [investmentsList, rates]);

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
    const yieldTypeVal = fd.get("yieldType") as any;
    const yieldRateVal = fd.get("yieldRate") ? Number(fd.get("yieldRate")) : undefined;

    if (!name || balance <= 0) return;

    const yieldType = yieldTypeVal && yieldTypeVal !== "none" ? yieldTypeVal : undefined;
    const yieldRate = yieldType && yieldRateVal ? yieldRateVal : undefined;

    if (addInvestment) {
      addInvestment({
        name,
        type,
        subtype: subtype || "Outros",
        balance,
        currency: "BRL",
        source: "manual",
        yieldType,
        yieldRate,
      });
    } else {
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
          yieldType,
          yieldRate,
        });
      });
    }

    e.currentTarget.reset();
  }

  function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingInv) return;

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const type = String(fd.get("type") || "Renda Fixa");
    const subtype = String(fd.get("subtype") || "").trim();
    const balance = Number(fd.get("balance") || 0);
    const yieldTypeVal = fd.get("yieldType") as any;
    const yieldRateVal = fd.get("yieldRate") ? Number(fd.get("yieldRate")) : undefined;

    if (!name || balance <= 0) return;

    const yieldType = yieldTypeVal && yieldTypeVal !== "none" ? yieldTypeVal : undefined;
    const yieldRate = yieldType && yieldRateVal ? yieldRateVal : undefined;

    if (updateInvestment) {
      updateInvestment(editingInv.id, {
        name,
        type,
        subtype: subtype || "Outros",
        balance,
        yieldType,
        yieldRate,
      });
    } else {
      update((s) => {
        if (!s.investments) s.investments = [];
        const idx = s.investments.findIndex((i) => i.id === editingInv.id);
        if (idx !== -1) {
          s.investments[idx] = {
            ...s.investments[idx],
            name,
            type,
            subtype: subtype || "Outros",
            balance,
            yieldType,
            yieldRate,
          };
        }
      });
    }

    setEditingInv(null);
  }

  return (
    <>
      {/* Top Welcome & Rates Indicators Row */}
      <section className="panel welcome-row" style={{ marginBottom: 20 }}>
        <div>
          <h2>Investimentos</h2>
          <p className="muted">Acompanhe seu patrimônio e simule os rendimentos da sua carteira.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="of-pill" style={{ background: "rgba(99, 102, 241, 0.12)", color: "var(--brand)", border: "1px solid rgba(99, 102, 241, 0.2)", fontSize: "0.82rem", padding: "6px 12px", borderRadius: 8, display: "flex", gap: 12 }}>
            <span>📊 CDI: <strong>{rates.cdi.toFixed(2)}%</strong></span>
            <span>⏱️ Selic: <strong>{rates.selic.toFixed(2)}%</strong></span>
            <span>🎈 IPCA (12m): <strong>{rates.ipca.toFixed(2)}%</strong></span>
            {ratesLoaded && <span style={{ color: "var(--green)" }} title="Atualizado do Banco Central">● Live</span>}
          </div>
        </div>
      </section>



      {/* Portfolio Header Cards */}
      <section className="metric-grid">
        <article className="metric-card patrimony">
          <div className="metric-icon-wrap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "var(--brand-soft)", borderRadius: "50%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--brand)" }}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <span>Total Investido</span>
            <strong>{money(totalValue)}</strong>
          </div>
        </article>
        <article className="metric-card income">
          <div className="metric-icon-wrap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, background: "rgba(16, 185, 129, 0.1)", borderRadius: "50%" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "var(--green)" }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <div>
            <span>Rendimento Estimado</span>
            <strong>
              {money(estimatedMonthlyYield)}{" "}
              <small style={{ display: "inline", fontSize: "0.8rem", color: "var(--green)" }}>
                /mês (~{totalValue > 0 ? ((estimatedMonthlyYield / totalValue) * 100).toFixed(2) : "0.00"}%)
              </small>
            </strong>
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
                <input name="name" required placeholder="Ex: CDB Itaú 120%, Tesouro Selic..." />
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
                  <input name="subtype" placeholder="Ex: CDB Liquidez Diária, FII" />
                </div>
              </div>
              <div className="form-group">
                <label>Saldo Atual</label>
                <input name="balance" type="number" step="0.01" min="0.01" required placeholder="0.00" />
              </div>
              
              <div className="form-row-2">
                <div className="form-group">
                  <label>Indexador de Rendimento</label>
                  <select name="yieldType">
                    <option value="none">Nenhum / Variável</option>
                    <option value="cdi">CDI (% do CDI)</option>
                    <option value="selic">Selic (% da Selic)</option>
                    <option value="pre">Pré-fixado (% a.a.)</option>
                    <option value="ipca">IPCA+ (% + IPCA)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Taxa de Rendimento (% / % a.a.)</label>
                  <input name="yieldRate" type="number" step="0.01" placeholder="Ex: 120 (se CDI) ou 12.5 (se Pré)" />
                </div>
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

                const monthlyYield = calculateMonthlyYield(inv);

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
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            {inv.type} · {inv.subtype} {isPluggy && <span className="of-pill">OF</span>}
                          </span>
                          {inv.yieldRate && inv.yieldType && (
                            <span style={{ fontSize: "0.75rem", color: "var(--green)", fontWeight: 500 }}>
                              📈 {inv.yieldRate}% {inv.yieldType.toUpperCase()} (Est: +{money(monthlyYield)}/mês)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <strong className="account-balance-value">{money(inv.balance)}</strong>
                      {!isPluggy && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => setEditingInv(inv)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--muted)",
                              cursor: "pointer",
                              padding: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Editar ativo"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                          </button>
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
                              padding: 4,
                              lineHeight: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Excluir ativo"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="chart-empty-state" style={{ marginTop: 24 }}>
              <div className="empty-chart-icon">💰</div>
              <p className="muted" style={{ marginBottom: 16 }}>Nenhum investimento registrado. Adicione um ativo no formulário manual para começar!</p>
            </div>
          )}
        </article>
      </section>

      {/* Edit Investment Modal */}
      {editingInv && (
        <div className="quick-insert-backdrop" onClick={() => setEditingInv(null)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-insert-header">
              <h2>Editar Investimento</h2>
              <button type="button" className="close-btn" onClick={() => setEditingInv(null)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="quick-insert-form">
              <div className="form-group">
                <label>Nome do Ativo</label>
                <input name="name" defaultValue={editingInv.name} required />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Tipo</label>
                  <select name="type" defaultValue={editingInv.type}>
                    <option value="Caixinhas">Caixinha / Poupança</option>
                    <option value="Renda Fixa">Renda Fixa (CDB, Tesouro...)</option>
                    <option value="Renda Variável">Renda Variável (Ações, FIIs...)</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Subtipo</label>
                  <input name="subtype" defaultValue={editingInv.subtype} />
                </div>
              </div>
              <div className="form-group">
                <label>Saldo Atual</label>
                <input name="balance" type="number" step="0.01" min="0.01" defaultValue={editingInv.balance} required />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Indexador de Rendimento</label>
                  <select name="yieldType" defaultValue={editingInv.yieldType || "none"}>
                    <option value="none">Nenhum / Variável</option>
                    <option value="cdi">CDI (% do CDI)</option>
                    <option value="selic">Selic (% da Selic)</option>
                    <option value="pre">Pré-fixado (% a.a.)</option>
                    <option value="ipca">IPCA+ (% + IPCA)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Taxa de Rendimento (% / % a.a.)</label>
                  <input name="yieldRate" type="number" step="0.01" defaultValue={editingInv.yieldRate || ""} placeholder="Ex: 120, 12.5, 6" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button type="button" className="secondary-action" onClick={() => setEditingInv(null)} style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="primary-action" style={{ flex: 1 }}>
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
