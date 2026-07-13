import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { totalPatrimony, currentMonth, monthLabel } from "@/domain/finance";
import { money } from "@/lib/format";
import { supabaseConfig } from "@/lib/supabase";
import { useMemo } from "react";

const NAV = [
  { to: "/dashboard", label: "Visão geral", icon: "i-dashboard" },
  { to: "/lancamentos", label: "Lançamentos", icon: "i-transactions" },
  { to: "/contas", label: "Contas", icon: "i-accounts" },
  { to: "/cartoes", label: "Cartões", icon: "i-cards" },
  { to: "/orcamentos", label: "Orçamentos", icon: "i-budgets" },
  { to: "/metas", label: "Metas", icon: "i-goals" },
  { to: "/relatorios", label: "Relatórios", icon: "i-reports" },
  { to: "/automacoes", label: "Automações", icon: "i-automation" },
  { to: "/open-finance", label: "Open Finance", icon: "i-accounts" },
  { to: "/correcao/open-finance", label: "Correção OF", icon: "i-security" },
  { to: "/seguranca", label: "Segurança", icon: "i-security" },
];

export function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { state, syncStatus, setSelectedMonth, ready } = useFinance();
  const location = useLocation();

  const months = useMemo(() => {
    if (!state) return [];
    const set = new Set([currentMonth(), state.settings.selectedMonth]);
    state.transactions.forEach((t) => set.add(t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [state]);

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/dashboard" className="brand">
          <img src="/assets/icon.svg" alt="" className="brand-mark" />
          <span><strong>Precis Finance</strong><small>Controle com precisão</small></span>
        </Link>

        <nav className="main-nav">
          {NAV.map((item) => (
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
          <p className="muted">Sync: {syncStatus}</p>
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
            <Link to="/login" className="icon-button" title="Conta">🔐</Link>
            <Link to="/lancamentos?novo=1" className="primary-action">+ Novo lançamento</Link>
          </div>
        </header>
        <section className="content"><Outlet /></section>
      </main>
    </div>
  );
}
