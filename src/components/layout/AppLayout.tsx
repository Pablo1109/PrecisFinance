import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { totalPatrimony, currentMonth, monthLabel, suggestCategory } from "@/domain/finance";
import { money } from "@/lib/format";
import { supabaseConfig } from "@/lib/supabase";
import { useMemo, useState, useEffect, FormEvent } from "react";
import type { TxType } from "@/domain/types";
import { ReviewQueueModal } from "../ReviewQueueModal";

const NAV = [
  { to: "/dashboard", label: "Visão geral", icon: "i-dashboard" },
  { to: "/lancamentos", label: "Lançamentos", icon: "i-transactions" },
  { to: "/contas", label: "Contas", icon: "i-accounts" },
  { to: "/contas-fixas", label: "Planejamento", icon: "i-calendar" },
  { to: "/cartoes", label: "Cartões", icon: "i-cards" },
  { to: "/investimentos", label: "Investimentos", icon: "i-reports" },
  { to: "/configuracoes", label: "Configurações", icon: "i-security" },
];

export function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { state, rawState, spouseState, setSelectedMonth, ready, addTransaction, showQuickInsert, setShowQuickInsert } = useFinance();
  const location = useLocation();

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [installments, setInstallments] = useState(2);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const pendingReview = useMemo(() => {
    if (!state) return [];
    return state.transactions.filter((t) => t.reviewed === false);
  }, [state]);

  const navItems = useMemo(() => {
    const items = [...NAV];
    if (rawState?.settings.spouseId || spouseState) {
      items.splice(1, 0, { to: "/familia", label: "Visão geral família", icon: "i-dashboard" });
    }
    return items;
  }, [rawState?.settings.spouseId, spouseState]);

  // Quick Insert Modal State
  const [type, setType] = useState<TxType>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState("");
  const [destAccountId, setDestAccountId] = useState("");
  const [cardId, setCardId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategory, setSubcategory] = useState("");

  const months = useMemo(() => {
    if (!state) return [];
    const set = new Set([currentMonth(), state.settings.selectedMonth]);
    state.transactions.forEach((t) => set.add(t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [state]);

  // Dynamic Suggest Category on Description blur
  const handleDescriptionBlur = () => {
    if (type === "transfer" || !state) return;
    const suggested = suggestCategory(state, description, type === "income" ? "income" : "expense");
    if (suggested) {
      setCategoryId(suggested.categoryId);
      setSubcategory(suggested.subcategory);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!state) return [];
    return state.categories.filter((c) => c.type === (type === "income" ? "income" : "expense"));
  }, [state, type]);

  const subcategories = useMemo(() => {
    if (!state) return [];
    const cat = state.categories.find((c) => c.id === categoryId);
    return cat ? cat.subcategories : [];
  }, [state, categoryId]);

  // Set default account when modal opens or state loads
  useEffect(() => {
    if (state?.accounts.length && !accountId) {
      setAccountId(state.accounts[0].id);
    }
  }, [state, accountId]);

  // Set default category when type or categoryId becomes invalid
  useEffect(() => {
    if (filteredCategories.length) {
      const exists = filteredCategories.some((c) => c.id === categoryId);
      if (!exists) {
        setCategoryId(filteredCategories[0].id);
        setSubcategory(filteredCategories[0].subcategories[0] || "");
      }
    }
  }, [filteredCategories, categoryId]);

  if (!authLoading && supabaseConfig.valid && !user && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (!ready || !state) {
    return (
      <section className="lock-screen">
        <section className="lock-panel"><p>Carregando…</p></section>
      </section>
    );
  }

  const accountLabel = user?.email ?? (supabaseConfig.valid ? "Não autenticado" : "Modo local");

  const handleQuickSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) return;

    if (type === "expense" && cardId && isSplit && installments > 1) {
      const splitAmount = +(parsedAmount / installments).toFixed(2);
      const [y, m, d] = date.split("-").map(Number);
      
      for (let i = 0; i < installments; i++) {
        let nextYear = y;
        let nextMonth = m + i;
        while (nextMonth > 12) {
          nextMonth -= 12;
          nextYear += 1;
        }
        const dateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        
        addTransaction({
          type: "expense",
          date: dateStr,
          description: `${description} (${i + 1}/${installments})`,
          amount: splitAmount,
          currency: state!.settings.baseCurrency,
          accountId: "",
          cardId,
          categoryId,
          subcategory,
          tags: "",
          location: "",
          note: `Parcela ${i + 1}/${installments} de ${description}`,
          recurring: false,
        });
      }
    } else {
      addTransaction({
        type,
        date,
        description,
        amount: parsedAmount,
        currency: state!.settings.baseCurrency,
        accountId: type === "expense" && cardId ? "" : accountId,
        cardId: type === "expense" ? cardId : "",
        categoryId: type === "transfer" ? "" : categoryId,
        subcategory: type === "transfer" ? "" : subcategory,
        tags: "",
        location: "",
        note: "",
        recurring: false,
        destAccountId: type === "transfer" ? destAccountId : undefined,
        destAmount: type === "transfer" ? parsedAmount : undefined,
      });
    }

    // Reset form state & close modal
    setAmount("");
    setDescription("");
    setCardId("");
    setIsSplit(false);
    setInstallments(2);
    if (filteredCategories.length) {
      setCategoryId(filteredCategories[0].id);
      setSubcategory(filteredCategories[0].subcategories[0] || "");
    } else {
      setCategoryId("");
      setSubcategory("");
    }
    setShowQuickInsert(false);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/dashboard" className="brand">
          <img src="/assets/icon.svg" alt="" className="brand-mark" />
          <span><strong>Precis Finance</strong><small>Controle com precisão</small></span>
        </Link>

        <nav className="main-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "is-active" : "")}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10, textDecoration: "none", color: "inherit", fontWeight: 600, fontSize: "0.9rem" }}
            >
              <svg className="nav-icon" aria-hidden="true" width={18} height={18}><use href={`#${item.icon}`} /></svg>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-summary">
          <p><strong>{accountLabel}</strong></p>
          {!user && supabaseConfig.valid && (
            <p><Link to="/login">→ Fazer login</Link></p>
          )}
          <p>Patrimônio: <strong>{money(totalPatrimony(state))}</strong></p>
          <p className="muted">{state.accounts.length} contas · {state.transactions.length} lançamentos</p>
        </div>
      </aside>

      <main className="workspace">

        {supabaseConfig.issues.length > 0 && (
          <section className="alerts">
            <article className="alert danger">
              <div>
                <strong>Supabase mal configurado</strong>
                <p>{supabaseConfig.issues.join(" ")}</p>
                {supabaseConfig.url && supabaseConfig.rawUrl !== supabaseConfig.url && (
                  <p className="muted">URL corrigida automaticamente para <code>{supabaseConfig.url}</code> — atualize o .env e reinicie o Vite.</p>
                )}
              </div>
            </article>
          </section>
        )}

        <header className="topbar">
          <div className="title-block">
            <p className="eyebrow">Painel financeiro</p>
            <h1 id="viewTitle">Precis Finance</h1>
          </div>
          <div className="topbar-actions">
            <label className="select-label">
              <span>Mês</span>
              <select
                value={state.settings.selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="Selecionar mês"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </label>
            <button
               type="button"
               className="icon-button"
               onClick={() => setIsDarkMode(!isDarkMode)}
               title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
               style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", marginRight: 8, padding: 6, color: "var(--ink)" }}
             >
               {isDarkMode ? (
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
               ) : (
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6.36 6.36 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
               )}
             </button>
             <Link to="/login" className="icon-button" title="Conta" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 8, padding: 6, color: "var(--ink)" }}>
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
             </Link>
             <button
               type="button"
               className="primary-action"
               onClick={() => setShowQuickInsert(true)}
             >
               + Novo lançamento
             </button>
          </div>
        </header>

        {pendingReview.length > 0 && (
           <div className="alert info review-alert-banner" style={{ margin: "0 24px 16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Você tem <strong>{pendingReview.length}</strong> novos lançamentos aguardando sua revisão!</span>
             <button type="button" className="primary-action small" onClick={() => setShowReviewModal(true)} style={{ padding: "6px 12px", fontSize: "0.85rem" }}>
               Revisar Agora
             </button>
           </div>
         )}

         <section className="content"><Outlet /></section>

         {showReviewModal && pendingReview.length > 0 && (
           <ReviewQueueModal
             pending={pendingReview}
             onClose={() => setShowReviewModal(false)}
           />
         )}
      </main>

      {/* Quick Insert Modal */}
      {showQuickInsert && (
        <div className="quick-insert-backdrop" onClick={() => setShowQuickInsert(false)}>
          <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
            <header className="quick-insert-header">
              <h2>Novo lançamento</h2>
              <button type="button" className="close-btn" onClick={() => setShowQuickInsert(false)}>×</button>
            </header>

            <div className="quick-insert-tabs">
              <button
                type="button"
                className={`tab-btn ${type === "expense" ? "active expense" : ""}`}
                onClick={() => { setType("expense"); setCardId(""); }}
              >
                Despesa
              </button>
              <button
                type="button"
                className={`tab-btn ${type === "income" ? "active income" : ""}`}
                onClick={() => { setType("income"); setCardId(""); }}
              >
                Receita
              </button>
              <button
                type="button"
                className={`tab-btn ${type === "transfer" ? "active transfer" : ""}`}
                onClick={() => { setType("transfer"); setCardId(""); }}
              >
                Transferência
              </button>
            </div>

            <form onSubmit={handleQuickSubmit} className="quick-insert-form">
              <div className="form-group amount-group">
                <label htmlFor="amount">Valor</label>
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">R$</span>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Descrição</label>
                <input
                  id="description"
                  name="description"
                  type="text"
                  placeholder="Ex: Supermercado, Almoço, Salário..."
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  autoComplete="off"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="date">Data</label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="accountId">
                    {type === "transfer" ? "Conta de Origem" : "Conta"}
                  </label>
                  <select
                    id="accountId"
                    name="accountId"
                    required
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">Selecionar conta</option>
                    {state.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {type === "transfer" ? (
                <div className="form-group">
                  <label htmlFor="destAccountId">Conta de Destino</label>
                  <select
                    id="destAccountId"
                    name="destAccountId"
                    required
                    value={destAccountId}
                    onChange={(e) => setDestAccountId(e.target.value)}
                  >
                    <option value="">Selecionar destino</option>
                    {state.accounts.map((a) => (
                      <option key={a.id} value={a.id} disabled={a.id === accountId}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="categoryId">Categoria</label>
                    <select
                      id="categoryId"
                      name="categoryId"
                      required
                      value={categoryId}
                      onChange={(e) => {
                        setCategoryId(e.target.value);
                        const cat = state.categories.find((c) => c.id === e.target.value);
                        setSubcategory(cat?.subcategories[0] || "");
                      }}
                    >
                      <option value="">Selecionar categoria</option>
                      {filteredCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="subcategory">Subcategoria</label>
                    <select
                      id="subcategory"
                      name="subcategory"
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                    >
                      <option value="">Nenhuma</option>
                      {subcategories.map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {type === "expense" && (
                <>
                  <div className="form-group">
                    <label htmlFor="cardId">Cartão de Crédito (Opcional)</label>
                    <select
                      id="cardId"
                      name="cardId"
                      value={cardId}
                      onChange={(e) => setCardId(e.target.value)}
                    >
                      <option value="">Nenhum (Debito/Dinheiro)</option>
                      {state.cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {cardId && (
                    <div style={{ display: "flex", gap: 16, alignItems: "center", background: "var(--surface-2)", padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", marginTop: 12 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontWeight: 700 }}>
                        <input 
                          type="checkbox" 
                          checked={isSplit} 
                          onChange={(e) => setIsSplit(e.target.checked)} 
                          style={{ width: 18, height: 18 }}
                        />
                        Parcelar compra?
                      </label>
                      
                      {isSplit && (
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span>Parcelas:</span>
                          <input 
                            type="number" 
                            min={2} 
                            max={48} 
                            value={installments}
                            onChange={(e) => setInstallments(Number(e.target.value))}
                            style={{ width: 60, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }} 
                          />
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="quick-insert-actions" style={{ marginTop: 24 }}>
                <button type="button" className="secondary-action" onClick={() => setShowQuickInsert(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-action">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

