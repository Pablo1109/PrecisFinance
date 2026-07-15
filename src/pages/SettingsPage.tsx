import { FormEvent, useState, useEffect } from "react";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { uid } from "@/lib/format";
import type { Category } from "@/domain/types";

type SettingsTab = "account" | "categories" | "preferences" | "family" | "danger-zone";
type CatTab = "expense" | "income" | "fixed";

export function SettingsPage() {
  const { user } = useAuth();
  const { state, rawState, update } = useFinance();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("account");
  const [activeCatTab, setActiveCatTab] = useState<CatTab>("expense");
  
  const [spouseInput, setSpouseInput] = useState("");
  const [userNameInput, setUserNameInput] = useState("");

  // Sync state settings userName to input
  useEffect(() => {
    if (rawState?.settings?.userName) {
      setUserNameInput(rawState.settings.userName);
    } else if (user) {
      setUserNameInput(user.user_metadata?.full_name || user.email?.split("@")[0] || "");
    }
  }, [rawState?.settings?.userName, user]);

  function handleSaveAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = userNameInput.trim();
    if (!name) return;
    update((s) => {
      s.settings.userName = name;
    });
    alert("Nome de exibição atualizado com sucesso!");
  }

  // Sync state settings spouse ID to local input on load
  useEffect(() => {
    if (rawState?.settings?.spouseId) {
      setSpouseInput(rawState.settings.spouseId);
    }
  }, [rawState?.settings?.spouseId]);

  function handleSaveSpouse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = spouseInput.trim();
    update((s) => {
      s.settings.spouseId = id || undefined;
    });
    alert("Vínculo de Conta Conjunta atualizado com sucesso!");
  }
  
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
            className={`secondary-action ${activeSettingsTab === "account" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "account" ? "var(--brand)" : "transparent",
              color: activeSettingsTab === "account" ? "var(--surface)" : "var(--ink)",
              border: activeSettingsTab === "account" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("account")}
          >
            Minha Conta
          </button>
          <button
            type="button"
            className={`secondary-action ${activeSettingsTab === "categories" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "categories" ? "var(--brand)" : "transparent",
              color: activeSettingsTab === "categories" ? "var(--surface)" : "var(--ink)",
              border: activeSettingsTab === "categories" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("categories")}
          >
            Categorias
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
              color: activeSettingsTab === "preferences" ? "var(--surface)" : "var(--ink)",
              border: activeSettingsTab === "preferences" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("preferences")}
          >
            Preferências Gerais
          </button>
          <button
            type="button"
            className={`secondary-action ${activeSettingsTab === "family" ? "active-action" : ""}`}
            style={{
              padding: "10px 14px",
              textAlign: "left",
              justifyContent: "flex-start",
              fontWeight: 700,
              background: activeSettingsTab === "family" ? "var(--brand)" : "transparent",
              color: activeSettingsTab === "family" ? "var(--surface)" : "var(--ink)",
              border: activeSettingsTab === "family" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("family")}
          >
            Conta Conjunta
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
              color: activeSettingsTab === "danger-zone" ? "var(--surface)" : "var(--ink)",
              border: activeSettingsTab === "danger-zone" ? "none" : "1px solid var(--line)",
              borderRadius: "var(--radius-sm)"
            }}
            onClick={() => setActiveSettingsTab("danger-zone")}
          >
            Zona de Perigo
          </button>
        </aside>

        {/* Settings Content Box */}
        <div className="settings-content-wrapper">
          
          {/* TAB 0: MINHA CONTA */}
          {activeSettingsTab === "account" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>Minha Conta & Perfil</h3>
                <p className="muted">Gerencie suas credenciais de login e identificação no painel da família.</p>
              </div>

              <section className="panel" style={{ padding: 24 }}>
                <form onSubmit={handleSaveAccount} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="form-group">
                    <label>Seu E-mail (Login)</label>
                    <input
                      type="text"
                      disabled
                      value={user?.email || ""}
                      style={{ opacity: 0.7, cursor: "not-allowed" }}
                    />
                  </div>

                  <div className="form-group">
                    <label>Seu ID de Usuário (Para vincular conta conjunta)</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        disabled
                        value={user?.id || ""}
                        style={{ fontFamily: "monospace", opacity: 0.7, cursor: "not-allowed", flex: 1 }}
                      />
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => {
                          navigator.clipboard.writeText(user?.id || "");
                          alert("ID copiado para a área de transferência!");
                        }}
                      >
                        📋 Copiar ID
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Seu Nome de Exibição / Apelido (Como aparecerá nas transações)</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Pablo, Mariana..."
                      value={userNameInput}
                      onChange={(e) => setUserNameInput(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="primary-action" style={{ alignSelf: "flex-start", marginTop: 8 }}>
                    💾 Salvar Alterações
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* TAB 1: CATEGORIES MANAGER */}
          {activeSettingsTab === "categories" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Gerenciar Categorias</h3>
                <button type="button" className="primary-action" onClick={() => setShowAddForm(true)}>
                  Nova Categoria
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
                      color: activeCatTab === tab ? "var(--surface)" : "var(--ink)",
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
          {activeSettingsTab === "family" && (
            <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <h3 style={{ margin: 0 }}>Conta Conjunta & Compartilhamento</h3>
              <p className="muted" style={{ margin: 0 }}>
                Conecte a sua conta com a do seu cônjuge para ver os saldos, faturas e lançamentos consolidados no Modo Família.
              </p>
              
              <div style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}>
                <strong>Seu ID de Compartilhamento:</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={user?.id || ""}
                    style={{ flex: 1, fontFamily: "monospace", padding: "8px 12px", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }}
                  />
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => {
                      navigator.clipboard.writeText(user?.id || "");
                      alert("ID copiado para a área de transferência!");
                    }}
                  >
                    Copiar ID
                  </button>
                </div>
                <small className="muted" style={{ display: "block", marginTop: 4 }}>
                  Envie este ID para seu cônjuge para que ele possa vincular as contas.
                </small>
              </div>

              <form onSubmit={handleSaveSpouse} style={{ padding: "16px 0", borderTop: "1px solid var(--line)" }}>
                <strong>Vincular Cônjuge:</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="Insira o ID de Compartilhamento do seu cônjuge"
                    value={spouseInput}
                    onChange={(e) => setSpouseInput(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--ink)" }}
                  />
                  <button type="submit" className="primary-action">
                    Salvar Vínculo
                  </button>
                </div>
                {rawState?.settings.spouseId && (
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--green)" }}>
                    <span>Vinculado ao ID: <code>{rawState.settings.spouseId}</code></span>
                    <button
                      type="button"
                      className="ghost-action"
                      style={{ color: "var(--red)", fontSize: "0.8rem", padding: "2px 6px" }}
                      onClick={() => {
                        if (window.confirm("Deseja realmente desvincular seu cônjuge?")) {
                          update((s) => {
                            s.settings.spouseId = undefined;
                          });
                          setSpouseInput("");
                          alert("Cônjuge desvinculado.");
                        }
                      }}
                    >
                      Desvincular
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

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
