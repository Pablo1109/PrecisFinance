import { FormEvent, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { uid } from "@/lib/format";
import type { Category } from "@/domain/types";

type SettingsTab = "categories" | "preferences" | "danger-zone";
type CatTab = "expense" | "income" | "fixed";

export function SettingsPage() {
  const { state, update } = useFinance();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("categories");
  const [activeCatTab, setActiveCatTab] = useState<CatTab>("expense");
  
  // Categories states
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  if (!state) return null;

  // Filter categories by active cat tab
  const categoriesList = (state.categories || []).filter((c) => c.type === activeCatTab);

  function handleAddCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const color = String(fd.get("color") || "#6366f1");

    if (!name) return;

    update((s) => {
      s.categories.push({
        id: uid("cat"),
        type: activeCatTab,
        name,
        color,
        subcategories: [],
      });
    });

    setShowAddForm(false);
    e.currentTarget.reset();
  }

  function handleEditCategorySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCat) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const color = String(fd.get("color") || "#6366f1");

    update((s) => {
      const cat = s.categories.find((c) => c.id === editingCat.id);
      if (cat) {
        cat.name = name;
        cat.color = color;
      }
    });

    setEditingCat(null);
  }

  function handleDeleteCategory(id: string) {
    if (!window.confirm("Deseja realmente excluir esta categoria?")) return;
    update((s) => {
      s.categories = s.categories.filter((c) => c.id !== id);
      s.transactions.forEach((t) => {
        if (t.categoryId === id) t.categoryId = "";
      });
      (s.recurringBills || []).forEach((b) => {
        if (b.categoryId === id) b.categoryId = "";
      });
    });
  }

  function handleResetData() {
    if (!window.confirm("ATENÇÃO: Isso excluirá TODOS os seus lançamentos manuais, contas, cartões e categorias personalizadas. Deseja prosseguir?")) return;
    if (!window.confirm("Tem certeza absoluta? Essa ação não pode ser desfeita.")) return;
    
    update((s) => {
      s.transactions = [];
      s.cards = [];
      s.accounts = [];
      s.recurringBills = [];
      s.investments = [];
    });
    alert("Dados reiniciados com sucesso!");
  }

  const CAT_TAB_LABELS: Record<CatTab, string> = {
    expense: "Categorias de Despesas",
    income: "Categorias de Receitas",
    fixed: "Categorias de Contas Fixas",
  };

  return (
    <>
      <section className="panel welcome-row">
        <div>
          <h2>Configurações do Sistema</h2>
          <p className="muted">Gerencie suas preferências, organize categorias e configure os parâmetros globais.</p>
        </div>
      </section>

      {/* Main settings columns */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, marginTop: 24 }}>
        
        {/* Settings Navigation Sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            className={`secondary-action ${activeSettingsTab === "categories" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "categories" ? "var(--brand)" : "transparent",
              color: activeSettingsTab === "categories" ? "#fff" : "var(--ink)",
              border: activeSettingsTab === "categories" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("categories")}
          >
            🏷️ Categorias
          </button>
          <button
            type="button"
            className={`secondary-action ${activeSettingsTab === "preferences" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "preferences" ? "var(--brand)" : "transparent",
              color: activeSettingsTab === "preferences" ? "#fff" : "var(--ink)",
              border: activeSettingsTab === "preferences" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("preferences")}
          >
            ⚙️ Preferências Gerais
          </button>
          <button
            type="button"
            className={`secondary-action ${activeSettingsTab === "danger-zone" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "danger-zone" ? "var(--red)" : "transparent",
              color: activeSettingsTab === "danger-zone" ? "#fff" : "var(--ink)",
              border: activeSettingsTab === "danger-zone" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("danger-zone")}
          >
            ⚠️ Zona de Perigo
          </button>
        </aside>

        {/* Settings Content Box */}
        <div className="settings-content-wrapper">
          
          {/* TAB 1: CATEGORIES MANAGER */}
          {activeSettingsTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Gerenciar Categorias</h3>
                <button type="button" className="primary-action" onClick={() => setShowAddForm(true)}>
                  ➕ Nova Categoria
                </button>
              </div>

              {/* Sub-tabs for Category Types */}
              <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                {(["expense", "income", "fixed"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`secondary-action ${activeCatTab === tab ? "active-action" : ""}`}
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      background: activeCatTab === tab ? "var(--brand)" : "transparent",
                      color: activeCatTab === tab ? "#fff" : "var(--ink)",
                      border: activeCatTab === tab ? "none" : "1px solid var(--line)"
                    }}
                    onClick={() => {
                      setActiveCatTab(tab);
                      setShowAddForm(false);
                    }}
                  >
                    {CAT_TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              {showAddForm && (
                <section className="panel">
                  <h4>Nova Categoria ({CAT_TAB_LABELS[activeCatTab]})</h4>
                  <form onSubmit={handleAddCategory} className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 12 }}>
                    <label className="field">
                      Nome da Categoria
                      <input name="name" required placeholder="Ex: Mercado, Combustível, Salário..." />
                    </label>
                    <label className="field">
                      Cor
                      <input type="color" name="color" defaultValue="#6366f1" style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
                    </label>
                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                      <button type="button" className="secondary-action" onClick={() => setShowAddForm(false)}>❌ Cancelar</button>
                      <button type="submit" className="primary-action">💾 Adicionar Categoria</button>
                    </div>
                  </form>
                </section>
              )}

              {editingCat && (
                <div className="quick-insert-backdrop" onClick={() => setEditingCat(null)}>
                  <div className="quick-insert-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="quick-insert-header">
                      <h2>Editar Categoria</h2>
                      <button type="button" className="close-btn" onClick={() => setEditingCat(null)}>×</button>
                    </div>
                    <form onSubmit={handleEditCategorySubmit} className="quick-insert-form">
                      <div className="form-group">
                        <label>Nome da Categoria</label>
                        <input name="name" required defaultValue={editingCat.name} />
                      </div>
                      <div className="form-group">
                        <label>Cor de Identificação</label>
                        <input type="color" name="color" defaultValue={editingCat.color || "#6366f1"} style={{ width: "100%", height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)", borderRadius: "var(--radius-xs)" }} />
                      </div>
                      <button type="submit" className="primary-action" style={{ marginTop: 12 }}>💾 Salvar Alterações</button>
                    </form>
                  </div>
                </div>
              )}

              <section className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 8 }}>
                {categoriesList.map((c) => (
                  <article 
                    key={c.id} 
                    className="panel" 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      padding: 12, 
                      borderRadius: "var(--radius)",
                      boxShadow: "var(--shadow-sm)",
                      border: "1px solid var(--line)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color || "#6366f1", display: "inline-block" }} />
                      <strong style={{ fontSize: "0.9rem", color: "var(--ink)" }}>{c.name}</strong>
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="ghost-action" style={{ padding: "2px 6px" }} onClick={() => setEditingCat(c)}>✏️</button>
                      <button type="button" className="ghost-action" style={{ color: "var(--red)", padding: "2px 6px" }} onClick={() => handleDeleteCategory(c.id)}>🗑️</button>
                    </div>
                  </article>
                ))}
                {categoriesList.length === 0 && (
                  <p className="muted">Nenhuma categoria cadastrada.</p>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: SYSTEM PREFERENCES */}
          {activeSettingsTab === "preferences" && (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <h3 style={{ margin: 0 }}>Preferências Gerais</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <strong>Moeda Base</strong>
                    <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0 0" }}>Moeda utilizada para consolidar patrimônio e relatórios.</p>
                  </div>
                  <select defaultValue="BRL" style={{ padding: "6px 12px", borderRadius: "var(--radius-xs)", border: "1px solid var(--line)" }} disabled>
                    <option value="BRL">Real Brasileiro (R$)</option>
                    <option value="USD">Dólar Americano ($)</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <strong>Idioma do Sistema</strong>
                    <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0 0" }}>Localização de formatos numéricos e datas.</p>
                  </div>
                  <select defaultValue="pt-BR" style={{ padding: "6px 12px", borderRadius: "var(--radius-xs)", border: "1px solid var(--line)" }} disabled>
                    <option value="pt-BR">Português (Brasil)</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>Lançamentos Manuais Padrão</strong>
                    <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0 0" }}>Ignora automaticamente transações sincronizadas do Open Finance no extrato principal.</p>
                  </div>
                  <span className="pill success" style={{ padding: "4px 8px" }}>Ativado</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DANGER ZONE */}
          {activeSettingsTab === "danger-zone" && (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20, borderLeft: "6px solid var(--red)" }}>
              <h3 style={{ margin: 0, color: "var(--red)" }}>Zona de Perigo</h3>
              <p className="muted" style={{ margin: 0 }}>Tenha cuidado com as ações abaixo. Elas realizam alterações permanentes nos seus dados armazenados em nuvem.</p>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <div>
                  <strong>Reiniciar Todos os Dados</strong>
                  <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0 0" }}>Exclui permanentemente todos os lançamentos manuais, contas fixas, contas bancárias e cartões.</p>
                </div>
                <button type="button" className="primary-action" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={handleResetData}>
                  ⚠️ Reiniciar Dados
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
