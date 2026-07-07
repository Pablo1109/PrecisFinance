const LEGACY_STORAGE_KEY = "precis-finance-state-v1";
const CLOUD_CACHE_PREFIX = "precis-finance-cloud-cache-v1:";
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR");

const routes = {
  dashboard: { title: "Visão geral", render: renderDashboard },
  transactions: { title: "Lançamentos", render: renderTransactions },
  accounts: { title: "Contas", render: renderAccounts },
  cards: { title: "Cartões", render: renderCards },
  budgets: { title: "Orçamentos", render: renderBudgets },
  goals: { title: "Metas", render: renderGoals },
  reports: { title: "Relatórios", render: renderReports },
  automation: { title: "Recorrências", render: renderAutomation },
  security: { title: "Segurança", render: renderSecurity }
};

const categoryColors = ["#176b5b", "#f27d72", "#4267b2", "#f0b84e", "#7d5ab6", "#26966f", "#c35f4d", "#5c7485"];

let state = null;
let currentUser = null;
let supabaseClient = null;
let cloudChannel = null;
let lastCloudUpdatedAt = "";
let syncStatus = "desconectado";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  bindShellEvents();
  registerServiceWorker();

  await initCloudAuth();
}

function bindShellEvents() {
  $("#mainNav").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button || !state) return;
    location.hash = `#/${button.dataset.view}`;
  });

  $("#newTxButton").addEventListener("click", () => {
    if (state) openTransactionModal();
  });

  $("#periodSelect").addEventListener("change", (event) => {
    if (!state) return;
    state.settings.selectedMonth = event.target.value;
    persist();
    render();
  });

  $("#lockButton").addEventListener("click", () => {
    if (currentUser) signOut();
    else showAuthScreen();
  });

  $("#lockScreen").addEventListener("click", async (event) => {
    const submitter = event.target.closest("[data-auth-action]");
    if (!submitter) return;
    if (submitter.dataset.authAction === "setup") {
      showCloudSetupScreen();
      return;
    }
    const form = submitter.closest("form");
    if (!form) return;
    event.preventDefault();
    await handleAuthSubmit(form, submitter.dataset.authAction);
  });

  window.addEventListener("hashchange", () => {
    if (state) render();
  });

  window.addEventListener("error", (event) => {
    console.error("[precis] Erro não tratado:", event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[precis] Promise rejeitada:", event.reason);
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const tag = (event.target && event.target.tagName) || "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (event.target && event.target.isContentEditable)) return;
    if (event.key === "n" && !event.ctrlKey && !event.metaKey && !event.altKey && state) {
      event.preventDefault();
      openTransactionModal();
    }
  });

  window.addEventListener("online", () => {
    if (state && currentUser && syncStatus !== "sincronizado") {
      saveCloudState().then(() => {
        if (syncStatus === "sincronizado") toast("Conexão voltou. Dados sincronizados.");
      });
    }
  });
}

function afterStateLoaded() {
  if (!location.hash) location.hash = "#/dashboard";
  hydratePeriodSelect();
  render();
}

async function initCloudAuth() {
  showAuthScreen("Carregando login...");

  const config = getCloudConfig();
  if (!config.url || !config.anonKey) {
    showCloudSetupScreen();
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (data.session?.user) {
      await loadUserSession(data.session.user);
    } else {
      showAuthScreen();
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user && session.user.id !== currentUser?.id) {
        await loadUserSession(session.user);
      }
      if (event === "TOKEN_REFRESHED" && !session) {
        // Refresh falhou: força novo login em vez de falhar em silêncio.
        clearSessionState();
        showAuthScreen("Sua sessão expirou. Entre novamente.");
      }
      if (event === "SIGNED_OUT") {
        clearSessionState();
        showAuthScreen();
      }
    });
  } catch {
    showCloudSetupScreen("Não foi possível iniciar o login em nuvem. Confira as chaves do Supabase.");
  }
}

function getCloudConfig() {
  const env = window.PRECIS_ENV || {};
  return {
    url: env.SUPABASE_URL || "",
    anonKey: env.SUPABASE_ANON_KEY || ""
  };
}

async function handleAuthSubmit(form, action) {
  if (!supabaseClient) {
    showCloudSetupScreen();
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");

  if (!email || !password) {
    toast("Informe e-mail e senha.");
    return;
  }

  setAuthBusy(form, true);
  try {
    if (action === "signup") {
      const { data: result, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: data.name || "" } }
      });
      if (error) throw error;
      if (result.session?.user) {
        await loadUserSession(result.session.user);
      } else {
        showAuthScreen("Conta criada. Confirme seu e-mail para entrar, se a confirmação estiver ativa no Supabase.");
      }
      return;
    }

    const { data: result, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadUserSession(result.user);
  } catch (error) {
    toast(error.message || "Não foi possível entrar.");
  } finally {
    setAuthBusy(form, false);
  }
}

function setAuthBusy(form, busy) {
  $$("button, input", form).forEach((element) => {
    element.disabled = busy;
  });
}

async function loadUserSession(user) {
  currentUser = user;
  syncStatus = "sincronizando";
  $("#lockScreen").hidden = true;

  const cached = loadCachedCloudState(user.id);
  const legacy = readLegacyLocalState();

  try {
    const { data, error } = await supabaseClient
      .from("finance_states")
      .select("state, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const cloudUpdatedAt = data?.updated_at || "";
    const cachedUpdatedAt = cached?.updatedAt || "";
    const cacheIsDirty = cached?.dirty === true;
    const cacheIsNewer = cached && (cacheIsDirty || (cachedUpdatedAt && cachedUpdatedAt > cloudUpdatedAt));

    if (data?.state && !cacheIsNewer) {
      // Nuvem é a verdade.
      state = normalizeState(data.state);
      lastCloudUpdatedAt = cloudUpdatedAt;
      cacheCloudState(cloudUpdatedAt, false);
      syncStatus = "sincronizado";
    } else if (cached) {
      // Cache local é mais novo (ou nuvem vazia): usa e reenvia.
      state = cached.state;
      lastCloudUpdatedAt = cloudUpdatedAt;
      await saveCloudState();
    } else if (legacy) {
      state = legacy;
      await saveCloudState();
    } else {
      state = createSeedState();
      await saveCloudState();
    }
  } catch (error) {
    console.error("[precis] Falha ao carregar dados da nuvem:", error);
    if (cached) {
      state = cached.state;
      syncStatus = "pendente";
      toast("Sem acesso ao banco agora. Usando dados salvos neste navegador.");
    } else if (legacy) {
      state = legacy;
      syncStatus = "pendente";
      toast("Sem acesso ao banco agora. Usando backup local.");
    } else {
      state = createSeedState();
      syncStatus = "erro";
      toast("Não foi possível acessar o Supabase. Verifique se a tabela finance_states existe e se as políticas RLS estão ativas.");
    }
  }

  subscribeToCloudChanges();
  afterStateLoaded();
}

function readLegacyLocalState() {
  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return null;
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return null;
  }
}

function showAuthScreen(message = "") {
  const config = getCloudConfig();
  const locked = $("#lockScreen");
  locked.innerHTML = `
    <form class="lock-panel auth-panel" id="cloudAuthForm">
      <img src="assets/icon.svg" alt="" />
      <h2>Precis Finance</h2>
      <p>${escapeHtml(message || "Entre para sincronizar suas finanças em qualquer dispositivo.")}</p>
      ${
        config.url && config.anonKey
          ? `
            <label class="field">
              Nome
              <input name="name" autocomplete="name" placeholder="Usado ao criar conta" />
            </label>
            <label class="field">
              E-mail
              <input name="email" type="email" autocomplete="email" required />
            </label>
            <label class="field">
              Senha
              <input name="password" type="password" autocomplete="current-password" minlength="6" required />
            </label>
            <button type="submit" class="primary-action" data-auth-action="signin">Entrar</button>
            <button type="submit" class="secondary-action" data-auth-action="signup">Criar conta</button>
          `
          : `<button type="button" class="primary-action" data-auth-action="setup">Configurar Supabase</button>`
      }
    </form>
  `;
  locked.hidden = false;
}

function showCloudSetupScreen(message = "") {
  const locked = $("#lockScreen");
  locked.innerHTML = `
    <section class="lock-panel auth-panel">
      <img src="assets/icon.svg" alt="" />
      <h2>Configurar nuvem</h2>
      <p>${escapeHtml(message || "Configure SUPABASE_URL e SUPABASE_ANON_KEY no Vercel para ativar login e sincronização.")}</p>
      <div class="setup-code">
        <strong>Variáveis no Vercel</strong>
        <span>SUPABASE_URL</span>
        <span>SUPABASE_ANON_KEY</span>
      </div>
      <p>Depois rode o SQL em <strong>database/supabase.sql</strong> no Supabase.</p>
    </section>
  `;
  locked.hidden = false;
}

function cloudCacheKey(userId = currentUser?.id) {
  return `${CLOUD_CACHE_PREFIX}${userId}`;
}

function loadCachedCloudState(userId) {
  const saved = localStorage.getItem(cloudCacheKey(userId));
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    // Compatibilidade com versão antiga (state puro).
    if (parsed && parsed.state) {
      return { state: normalizeState(parsed.state), updatedAt: parsed.updatedAt || "", dirty: !!parsed.dirty };
    }
    return { state: normalizeState(parsed), updatedAt: "", dirty: false };
  } catch {
    return null;
  }
}

function cacheCloudState(updatedAt, dirty = false) {
  if (!currentUser || !state) return;
  const payload = { state, updatedAt: updatedAt || lastCloudUpdatedAt || new Date().toISOString(), dirty };
  try {
    localStorage.setItem(cloudCacheKey(), JSON.stringify(payload));
  } catch (error) {
    console.error("[precis] Falha ao cachear estado local:", error);
  }
}

let saveInFlight = null;
let pendingSave = false;

async function saveCloudState() {
  if (!currentUser || !state) return;
  if (!supabaseClient) {
    // Sem nuvem configurada: ainda assim persiste local para não perder edições.
    cacheCloudState(new Date().toISOString(), true);
    syncStatus = "somente local";
    return;
  }

  if (saveInFlight) {
    // Se já existe upload em andamento, marca para reenvio ao terminar.
    pendingSave = true;
    return saveInFlight;
  }

  saveInFlight = (async () => {
    try {
      syncStatus = "sincronizando";
      const updatedAt = new Date().toISOString();
      // Salva localmente ANTES para nunca perder edição mesmo se a rede cair.
      cacheCloudState(updatedAt, true);

      const { error } = await supabaseClient.from("finance_states").upsert(
        {
          user_id: currentUser.id,
          state,
          updated_at: updatedAt
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      lastCloudUpdatedAt = updatedAt;
      syncStatus = "sincronizado";
      cacheCloudState(updatedAt, false);
    } catch (error) {
      syncStatus = "pendente";
      console.error("[precis] Falha ao salvar na nuvem:", error);
      const status = error?.status || error?.code;
      if (status === 401 || status === "PGRST301" || /jwt|token/i.test(String(error?.message || ""))) {
        toast("Sessão expirada. Faça login novamente.");
        try { await supabaseClient.auth.signOut(); } catch (_) {}
      } else {
        toast("Não foi possível salvar na nuvem agora. Suas edições ficam salvas neste dispositivo e serão reenviadas.");
      }
    } finally {
      saveInFlight = null;
      if (pendingSave) {
        pendingSave = false;
        saveCloudState();
      }
    }
  })();

  return saveInFlight;
}

function subscribeToCloudChanges() {
  if (!supabaseClient || !currentUser) return;
  if (cloudChannel) {
    supabaseClient.removeChannel(cloudChannel);
    cloudChannel = null;
  }

  cloudChannel = supabaseClient
    .channel(`finance-state-${currentUser.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "finance_states",
        filter: `user_id=eq.${currentUser.id}`
      },
      (payload) => {
        const incoming = payload.new;
        if (!incoming?.state || !incoming.updated_at) return;
        if (incoming.updated_at <= lastCloudUpdatedAt) return;
        state = normalizeState(incoming.state);
        lastCloudUpdatedAt = incoming.updated_at;
        syncStatus = "sincronizado";
        cacheCloudState(incoming.updated_at, false);
        hydratePeriodSelect();
        render();
        toast("Dados atualizados pela nuvem em outro dispositivo.");
      }
    )
    .subscribe();
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function clearSessionState() {
  if (cloudChannel && supabaseClient) {
    supabaseClient.removeChannel(cloudChannel);
  }
  cloudChannel = null;
  currentUser = null;
  state = null;
  lastCloudUpdatedAt = "";
  syncStatus = "desconectado";
}

function normalizeState(value) {
  const seed = createSeedState();
  return {
    ...seed,
    ...value,
    settings: { ...seed.settings, ...(value.settings || {}) },
    accounts: value.accounts || seed.accounts,
    cards: (value.cards || seed.cards).map((card) => ({
      accountId: "",
      autoPay: false,
      ...card
    })),
    categories: value.categories || seed.categories,
    transactions: value.transactions || seed.transactions,
    budgets: value.budgets || seed.budgets,
    goals: value.goals || seed.goals,
    rules: value.rules || seed.rules,
    schemaVersion: value.schemaVersion || 1
  };
}

function createSeedState() {
  const month = currentMonth();
  const lastMonth = shiftMonth(month, -1);
  const day = (monthValue, dayValue) => `${monthValue}-${String(dayValue).padStart(2, "0")}`;

  const categories = [
    { id: "cat_salary", type: "income", name: "Salário", subcategories: ["CLT", "Pro labore"], color: "#26966f" },
    { id: "cat_extra", type: "income", name: "Renda extra", subcategories: ["Freelance", "Venda", "Dividendos"], color: "#4267b2" },
    { id: "cat_home", type: "expense", name: "Moradia", subcategories: ["Aluguel", "Condomínio", "Energia", "Internet"], color: "#176b5b" },
    { id: "cat_food", type: "expense", name: "Alimentação", subcategories: ["Supermercado", "Restaurante", "Delivery"], color: "#f27d72" },
    { id: "cat_transport", type: "expense", name: "Transporte", subcategories: ["Combustível", "Aplicativos", "Manutenção"], color: "#4267b2" },
    { id: "cat_health", type: "expense", name: "Saúde", subcategories: ["Plano", "Farmácia", "Consultas"], color: "#7d5ab6" },
    { id: "cat_leisure", type: "expense", name: "Lazer", subcategories: ["Cinema", "Viagens", "Eventos"], color: "#f0b84e" },
    { id: "cat_subs", type: "expense", name: "Assinaturas", subcategories: ["Streaming", "Software", "Academia"], color: "#c35f4d" },
    { id: "cat_cards", type: "expense", name: "Cartões e crédito", subcategories: ["Juros", "Anuidade", "Tarifas"], color: "#5c7485" }
  ];

  return {
    schemaVersion: 1,
    settings: {
      selectedMonth: month,
      baseCurrency: "BRL",
      rates: { BRL: 1, USD: 5.45, EUR: 5.9, GBP: 6.92 },
      autoCategorization: true
    },
    accounts: [
      { id: "acc_main", name: "Conta principal", type: "Conta corrente", currency: "BRL", balance: 8420.45, color: "#176b5b" },
      { id: "acc_savings", name: "Reserva", type: "Poupança", currency: "BRL", balance: 18500, color: "#4267b2" },
      { id: "acc_cash", name: "Dinheiro", type: "Carteira", currency: "BRL", balance: 360, color: "#f0b84e" },
      { id: "acc_usd", name: "Conta dólar", type: "Internacional", currency: "USD", balance: 720, color: "#7d5ab6" }
    ],
    cards: [
      { id: "card_black", name: "Black final 1020", brand: "Mastercard", limit: 9800, closingDay: 18, dueDay: 26, color: "#13201c", accountId: "acc_main", autoPay: true },
      { id: "card_gold", name: "Gold final 4411", brand: "Visa", limit: 5200, closingDay: 8, dueDay: 16, color: "#b8892e", accountId: "acc_main", autoPay: false }
    ],
    categories,
    transactions: [
      tx("income", day(month, 5), "Salário", 8300, "BRL", "acc_main", "", "cat_salary", "CLT", "trabalho", "", "Pagamento mensal", true),
      tx("expense", day(month, 6), "Aluguel apartamento", 2350, "BRL", "acc_main", "", "cat_home", "Aluguel", "casa", "", "", true),
      tx("expense", day(month, 8), "Supermercado", 486.72, "BRL", "acc_main", "", "cat_food", "Supermercado", "mercado", "Fortaleza", "", false),
      tx("expense", day(month, 10), "Aplicativo de transporte", 38.9, "BRL", "acc_main", "", "cat_transport", "Aplicativos", "uber", "", "", false),
      tx("expense", day(month, 12), "Streaming família", 59.9, "BRL", "acc_main", "", "cat_subs", "Streaming", "assinatura", "", "", true),
      tx("expense", day(month, 13), "Restaurante", 146.5, "BRL", "", "card_black", "cat_food", "Restaurante", "lazer,jantar", "Meireles", "", false),
      tx("expense", day(month, 14), "Combustível", 220, "BRL", "", "card_gold", "cat_transport", "Combustível", "carro", "", "", false),
      tx("income", day(lastMonth, 5), "Salário", 8300, "BRL", "acc_main", "", "cat_salary", "CLT", "trabalho", "", "", true),
      tx("expense", day(lastMonth, 6), "Aluguel apartamento", 2350, "BRL", "acc_main", "", "cat_home", "Aluguel", "casa", "", "", true),
      tx("expense", day(lastMonth, 14), "Viagem curta", 680, "BRL", "", "card_black", "cat_leisure", "Viagens", "viagem", "", "", false)
    ],
    budgets: [
      { id: "bud_food", month, categoryId: "cat_food", limit: 1200 },
      { id: "bud_transport", month, categoryId: "cat_transport", limit: 650 },
      { id: "bud_leisure", month, categoryId: "cat_leisure", limit: 800 },
      { id: "bud_subs", month, categoryId: "cat_subs", limit: 250 }
    ],
    goals: [
      { id: "goal_emergency", name: "Reserva de emergência", target: 30000, saved: 18500, deadline: `${new Date().getFullYear()}-12-20`, currency: "BRL", color: "#176b5b" },
      { id: "goal_trip", name: "Viagem de férias", target: 9000, saved: 2800, deadline: `${new Date().getFullYear() + 1}-02-10`, currency: "BRL", color: "#f0b84e" }
    ],
    rules: [
      { id: "rule_uber", keyword: "uber", categoryId: "cat_transport", subcategory: "Aplicativos" },
      { id: "rule_ifood", keyword: "ifood", categoryId: "cat_food", subcategory: "Delivery" },
      { id: "rule_mercado", keyword: "supermercado", categoryId: "cat_food", subcategory: "Supermercado" },
      { id: "rule_netflix", keyword: "streaming", categoryId: "cat_subs", subcategory: "Streaming" }
    ]
  };
}

function tx(type, date, description, amount, currency, accountId, cardId, categoryId, subcategory, tags, location, note, recurring) {
  return {
    id: uid("tx"),
    type,
    date,
    description,
    amount,
    currency,
    accountId,
    cardId,
    categoryId,
    subcategory,
    tags,
    location,
    note,
    recurring,
    attachmentName: "",
    createdAt: new Date().toISOString()
  };
}

function render() {
  if (runAutoCardPayments()) {
    // Salva silenciosamente as faturas quitadas automaticamente.
    persist();
  }
  const view = getActiveView();
  $("#viewTitle").textContent = routes[view].title;

  $$("#mainNav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  hydratePeriodSelect();
  renderSidebarSummary();
  renderAlerts();
  const currentContent = $("#content");
  const freshContent = currentContent.cloneNode(false);
  currentContent.replaceWith(freshContent);
  routes[view].render(freshContent);
}

function getActiveView() {
  const fromHash = location.hash.replace("#/", "") || "dashboard";
  return routes[fromHash] ? fromHash : "dashboard";
}

function hydratePeriodSelect() {
  const select = $("#periodSelect");
  const months = new Set([currentMonth(), state.settings.selectedMonth]);
  state.transactions.forEach((transaction) => months.add(transaction.date.slice(0, 7)));
  state.budgets.forEach((budget) => months.add(budget.month));

  const sorted = Array.from(months).sort().reverse();
  select.innerHTML = sorted
    .map((month) => `<option value="${month}" ${month === state.settings.selectedMonth ? "selected" : ""}>${monthLabel(month)}</option>`)
    .join("");
}

function renderSidebarSummary() {
  const total = totalPatrimony();
  $("#sidebarSummary").innerHTML = `
    <p>Conta conectada</p>
    <strong>${escapeHtml(currentUser?.email || "sem login")}</strong>
    <p>Status: ${escapeHtml(syncStatus)}</p>
    <hr>
    <p>Patrimônio atual</p>
    <strong>${money(total)}</strong>
    <p>${state.accounts.length} contas, ${state.cards.length} cartões</p>
  `;
}

function renderAlerts() {
  const alerts = budgetAlerts(state.settings.selectedMonth);
  const monthly = monthlyTotals(state.settings.selectedMonth);
  const container = $("#alerts");

  if (!alerts.length) {
    container.innerHTML = `
      <article class="alert success">
        <div>
          <strong>${monthly.balance >= 0 ? "Mês sob controle" : "Atenção ao fluxo do mês"}</strong>
          <p>${monthly.balance >= 0 ? "Nenhum orçamento ultrapassou os limites configurados." : "As despesas superam as receitas no mês selecionado."}</p>
        </div>
        <span class="pill ${monthly.balance >= 0 ? "" : "danger"}">${money(monthly.balance)}</span>
      </article>
    `;
    return;
  }

  container.innerHTML = alerts
    .slice(0, 3)
    .map((alert) => `
      <article class="alert ${alert.level}">
        <div>
          <strong>${escapeHtml(alert.title)}</strong>
          <p>${escapeHtml(alert.message)}</p>
        </div>
        <span class="pill ${alert.level === "danger" ? "danger" : "warn"}">${Math.round(alert.percent)}%</span>
      </article>
    `)
    .join("");
}

function renderDashboard(container) {
  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(month);
  const cardDebt = state.cards.reduce((sum, card) => sum + cardOutstanding(card.id, month), 0);
  const recent = getMonthTransactions(month).slice().sort(sortByDateDesc).slice(0, 6);

  container.innerHTML = `
    <section class="metric-grid">
      ${metricCard("Patrimônio", money(totalPatrimony()), "Soma de contas convertidas", "positive")}
      ${metricCard("Receitas", money(totals.income), "Entradas no mês", "positive")}
      ${metricCard("Despesas", money(totals.expense), "Saídas e compras no cartão", totals.expense > totals.income ? "negative" : "")}
      ${metricCard("Saldo mensal", money(totals.balance), "Receitas menos despesas", totals.balance >= 0 ? "positive" : "negative")}
    </section>

    <section class="dashboard-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Evolução financeira</h2>
            <p>Receitas, despesas e saldo nos últimos meses.</p>
          </div>
          <span class="pill">${monthLabel(month)}</span>
        </div>
        <div class="canvas-box"><canvas id="cashflowChart" aria-label="Gráfico de evolução financeira"></canvas></div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Despesas por categoria</h2>
            <p>Distribuição do mês selecionado.</p>
          </div>
        </div>
        <div class="canvas-box"><canvas id="categoryChart" aria-label="Gráfico de categorias"></canvas></div>
        <ul class="legend-list" id="categoryLegend"></ul>
      </article>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Últimos lançamentos</h2>
            <p>${recent.length ? "Movimentações mais recentes do mês." : "Nenhum lançamento neste mês."}</p>
          </div>
          <button class="secondary-action" type="button" data-open-view="transactions">Ver todos</button>
        </div>
        ${recent.length ? `<ul class="mini-list">${recent.map(transactionListItem).join("")}</ul>` : emptyState("Sem lançamentos no período.")}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Cartões</h2>
            <p>Faturas projetadas para o mês.</p>
          </div>
          <span class="pill ${cardDebt > 0 ? "warn" : ""}">${money(cardDebt)}</span>
        </div>
        <ul class="stack-list">
          ${state.cards
            .map((card) => {
              const spent = cardSpent(card.id, month);
              const outstanding = cardOutstanding(card.id, month);
              const percent = Math.min(100, (spent / card.limit) * 100);
              return `
                <li>
                  <div class="item-title">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span>${money(outstanding)}</span>
                  </div>
                  <div class="progress ${percent >= 80 ? "danger" : percent >= 50 ? "warn" : ""}" style="--value:${percent}%"><span></span></div>
                  <small class="muted">Compras: ${money(spent)} · limite livre: ${money(Math.max(0, card.limit - spent))} · vence dia ${card.dueDay}</small>
                </li>
              `;
            })
            .join("")}
        </ul>
      </article>
    </section>
  `;

  container.querySelector("[data-open-view='transactions']").addEventListener("click", () => {
    location.hash = "#/transactions";
  });

  requestAnimationFrame(() => {
    drawCashflowChart("cashflowChart");
    drawCategoryChart("categoryChart", "categoryLegend", month);
  });
}

function renderTransactions(container) {
  const categories = state.categories;
  container.innerHTML = `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Buscar e auditar</h2>
          <p>Filtre por texto, tipo, categoria e forma de pagamento.</p>
        </div>
        <div class="inline-group">
          <button class="secondary-action" type="button" id="exportCsv">CSV</button>
          <button class="secondary-action" type="button" id="exportExcel">Excel</button>
        </div>
      </div>
      <div class="filter-bar">
        <input id="txSearch" type="search" placeholder="Buscar por descrição, tag, local ou observação" />
        <select id="txTypeFilter">
          <option value="">Todos os tipos</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
          <option value="transfer">Transferências</option>
        </select>
        <select id="txCategoryFilter">
          <option value="">Todas categorias</option>
          ${categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
        </select>
        <select id="txPaymentFilter">
          <option value="">Contas e cartões</option>
          ${state.accounts.map((account) => `<option value="acc:${account.id}">${escapeHtml(account.name)}</option>`).join("")}
          ${state.cards.map((card) => `<option value="card:${card.id}">${escapeHtml(card.name)}</option>`).join("")}
        </select>
      </div>
    </section>

    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Pagamento</th>
            <th>Tags</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="txTableBody"></tbody>
      </table>
    </section>
  `;

  const drawRows = () => {
    const filtered = filteredTransactions(container);
    $("#txTableBody", container).innerHTML = filtered.length
      ? filtered.map(transactionRow).join("")
      : `<tr><td colspan="7">${emptyState("Nenhum lançamento encontrado.")}</td></tr>`;
  };

  ["txSearch", "txTypeFilter", "txCategoryFilter", "txPaymentFilter"].forEach((id) => {
    $(`#${id}`, container).addEventListener("input", drawRows);
  });

  $("#exportCsv", container).addEventListener("click", () => exportTransactions("csv", filteredTransactions(container)));
  $("#exportExcel", container).addEventListener("click", () => exportTransactions("xls", filteredTransactions(container)));

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-tx") openTransactionModal(button.dataset.id);
    if (button.dataset.action === "delete-tx") deleteTransaction(button.dataset.id);
  });

  drawRows();
}

function renderAccounts(container) {
  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addAccount">＋ Nova conta</button>
      <button class="secondary-action" type="button" id="newTransfer">↔ Transferir</button>
      <label class="secondary-action" for="statementInput">Importar extrato CSV</label>
      <input id="statementInput" type="file" accept=".csv,text/csv" hidden />
      <button class="secondary-action" type="button" id="editRates">Moedas</button>
    </section>

    <section class="card-grid">
      ${state.accounts.map(accountCard).join("")}
    </section>

  `;

  $("#addAccount", container).addEventListener("click", () => openAccountModal());
  $("#editRates", container).addEventListener("click", openRatesModal);
  $("#newTransfer", container).addEventListener("click", () => openTransferModal());
  $("#statementInput", container).addEventListener("change", (event) => importStatement(event.target.files[0]));

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-account") openAccountModal(button.dataset.id);
    if (button.dataset.action === "delete-account") deleteAccount(button.dataset.id);
  });
}

function renderCards(container) {
  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addCard">＋ Novo cartão</button>
    </section>
    <section class="card-grid">
      ${state.cards.map(renderCardArticle).join("") || emptyState("Nenhum cartão cadastrado.")}
    </section>
  `;

  $("#addCard", container).addEventListener("click", () => openCardModal());
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-card") openCardModal(button.dataset.id);
    if (button.dataset.action === "delete-card") deleteCard(button.dataset.id);
    if (button.dataset.action === "pay-card") payCardInvoice(button.dataset.id, button.dataset.month);
  });
}

function renderCardArticle(card) {
  const openMonth = openInvoiceMonth(card);
  const openTotal = cardSpent(card.id, openMonth);
  const openPaid = cardPayments(card.id, openMonth);
  const openOutstanding = Math.max(0, openTotal - openPaid);
  const percent = card.limit ? Math.min(100, (cardCommittedTotal(card.id) / card.limit) * 100) : 0;
  const free = Math.max(0, card.limit - cardCommittedTotal(card.id));
  const linkedAccount = card.accountId ? findAccount(card.accountId) : null;
  const invoices = cardInvoiceList(card, 4);
  return `
    <article class="item-card">
      <div class="item-title">
        <div>
          <span class="inline-group"><span class="swatch" style="background:${card.color}"></span><strong>${escapeHtml(card.name)}</strong></span>
          <p class="muted">${escapeHtml(card.brand)} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}</p>
          <p class="muted">${linkedAccount ? `Debita em ${escapeHtml(linkedAccount.name)}${card.autoPay ? " · pagamento automático" : ""}` : "Sem conta vinculada"}</p>
        </div>
        <span class="pill ${percent >= 80 ? "danger" : percent >= 50 ? "warn" : ""}">${Math.round(percent)}%</span>
      </div>
      <div>
        <strong>${money(openOutstanding)}</strong>
        <p class="muted">Fatura em aberto (${monthLabel(openMonth)}) · vence ${formatShortDate(invoiceDueDate(card, openMonth))} · ${money(free)} de limite livre</p>
      </div>
      <div class="progress ${percent >= 80 ? "danger" : percent >= 50 ? "warn" : ""}" style="--value:${percent}%"><span></span></div>
      <div class="invoice-list">
        ${invoices.map((inv) => `
          <div class="invoice-row ${inv.status}">
            <div>
              <strong>${monthLabel(inv.month)}</strong>
              <p class="muted">${invoiceStatusLabel(inv)} · vence ${formatShortDate(inv.dueDate)}</p>
            </div>
            <div class="invoice-values">
              <strong>${money(inv.outstanding)}</strong>
              ${inv.paid > 0 ? `<small class="muted">Pago: ${money(inv.paid)} de ${money(inv.total)}</small>` : `<small class="muted">Total: ${money(inv.total)}</small>`}
            </div>
            <button class="ghost-action" type="button" data-action="pay-card" data-id="${card.id}" data-month="${inv.month}" ${inv.outstanding <= 0 ? "disabled" : ""}>${inv.outstanding <= 0 ? "Paga" : "Pagar"}</button>
          </div>
        `).join("")}
      </div>
      <div class="inline-group">
        <button class="secondary-action" type="button" data-action="edit-card" data-id="${card.id}">Editar</button>
        <button class="danger-action" type="button" data-action="delete-card" data-id="${card.id}">Excluir</button>
      </div>
    </article>
  `;
}

function renderBudgets(container) {
  const month = state.settings.selectedMonth;
  const budgets = state.budgets.filter((budget) => budget.month === month);

  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addBudget">＋ Novo orçamento</button>
      <button class="secondary-action" type="button" id="copyBudgets">Copiar mês anterior</button>
    </section>
    <section class="card-grid">
      ${budgets.length ? budgets.map(budgetCard).join("") : emptyState("Nenhum orçamento configurado para este mês.")}
    </section>
  `;

  $("#addBudget", container).addEventListener("click", () => openBudgetModal());
  $("#copyBudgets", container).addEventListener("click", copyPreviousBudgets);
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-budget") openBudgetModal(button.dataset.id);
    if (button.dataset.action === "delete-budget") deleteBudget(button.dataset.id);
  });
}

function renderGoals(container) {
  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addGoal">＋ Nova meta</button>
    </section>
    <section class="card-grid">
      ${state.goals.length ? state.goals.map(goalCard).join("") : emptyState("Nenhuma meta criada.")}
    </section>
  `;

  $("#addGoal", container).addEventListener("click", () => openGoalModal());
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-goal") openGoalModal(button.dataset.id);
    if (button.dataset.action === "contribute-goal") openContributionModal(button.dataset.id);
    if (button.dataset.action === "delete-goal") deleteGoal(button.dataset.id);
  });
}

function renderReports(container) {
  const month = state.settings.selectedMonth;
  const totals = monthlyTotals(month);
  const categoryRows = expenseByCategory(month);

  container.innerHTML = `
    <section class="metric-grid">
      ${metricCard("Resultado do mês", money(totals.balance), "Lucro ou prejuízo líquido", totals.balance >= 0 ? "positive" : "negative")}
      ${metricCard("Taxa de poupança", `${savingsRate(month)}%`, "Saldo dividido por receitas", "positive")}
      ${metricCard("Maior categoria", categoryRows[0] ? escapeHtml(categoryRows[0].name) : "Sem despesas", categoryRows[0] ? money(categoryRows[0].total) : "Nenhum dado", "")}
      ${metricCard("Transações", String(getMonthTransactions(month).length), "Total no período", "")}
    </section>

    <section class="reports-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Balanço anual</h2>
            <p>Receitas, despesas e saldo por mês.</p>
          </div>
        </div>
        <div class="canvas-box"><canvas id="annualChart"></canvas></div>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Categoria no mês</h2>
            <p>Ranking de gastos do período.</p>
          </div>
        </div>
        <ul class="stack-list">
          ${categoryRows.length
            ? categoryRows
                .map((item) => {
                  const percent = totals.expense ? (item.total / totals.expense) * 100 : 0;
                  return `
                    <li>
                      <div class="item-title">
                        <span class="inline-group"><span class="swatch" style="background:${item.color}"></span><strong>${escapeHtml(item.name)}</strong></span>
                        <span>${money(item.total)}</span>
                      </div>
                      <div class="progress" style="--value:${percent}%"><span></span></div>
                    </li>
                  `;
                })
                .join("")
            : emptyState("Sem despesas para analisar.")}
        </ul>
      </article>
    </section>
  `;

  requestAnimationFrame(() => drawAnnualChart("annualChart"));
}

function renderAutomation(container) {
  const recurring = state.transactions.filter((transaction) => transaction.recurring);
  container.innerHTML = `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Recorrências</h2>
            <p>Receitas e despesas fixas usadas para gerar o mês atual.</p>
          </div>
          <button class="secondary-action" type="button" id="processRecurring">Processar mês</button>
        </div>
        ${recurring.length ? `<ul class="stack-list">${recurring.map(recurringItem).join("")}</ul>` : emptyState("Nenhuma recorrência ativa.")}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Regras de categorização</h2>
            <p>Palavras-chave usadas para sugerir categoria em novos lançamentos e importações de CSV.</p>
          </div>
          <button class="secondary-action" type="button" id="addRule">Nova regra</button>
        </div>
        ${state.rules.length ? `<div class="card-grid">${state.rules.map(ruleCard).join("")}</div>` : emptyState("Nenhuma regra cadastrada.")}
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Categorias</h2>
          <p>Crie e edite categorias usadas nos lançamentos, orçamentos e relatórios.</p>
        </div>
        <button class="secondary-action" type="button" id="addCategory">Nova categoria</button>
      </div>
      <div class="card-grid">
        ${state.categories.map(categoryCard).join("")}
      </div>
    </section>
  `;

  $("#processRecurring", container).addEventListener("click", processRecurringForMonth);
  $("#addRule", container).addEventListener("click", () => openRuleModal());
  $("#addCategory", container).addEventListener("click", () => openCategoryModal());
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-rule") deleteRule(button.dataset.id);
    if (button.dataset.action === "edit-category") openCategoryModal(button.dataset.id);
    if (button.dataset.action === "delete-category") deleteCategory(button.dataset.id);
  });
}

function renderSecurity(container) {
  container.innerHTML = `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Conta em nuvem</h2>
            <p>${currentUser ? escapeHtml(currentUser.email) : "Nenhum usuario conectado."}</p>
          </div>
          <span class="pill ${syncStatus === "sincronizado" ? "" : syncStatus === "pendente" ? "warn" : "neutral"}">${escapeHtml(syncStatus)}</span>
        </div>
        <p class="muted">Entrando com o mesmo e-mail em outro dispositivo, o painel carrega o mesmo estado salvo no Supabase.</p>
        <div class="inline-group">
          <button class="primary-action" type="button" id="syncNow">Sincronizar agora</button>
          <button class="danger-action" type="button" id="signOutNow">Sair da conta</button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Backups</h2>
            <p>Exporte ou restaure os dados da sua conta.</p>
          </div>
        </div>
        <div class="inline-group">
          <button class="secondary-action" type="button" id="exportBackup">Exportar JSON</button>
          <label class="secondary-action" for="backupInput">Importar JSON</label>
          <input id="backupInput" type="file" accept="application/json,.json" hidden />
          <button class="danger-action" type="button" id="resetDemo">Resetar meus dados</button>
        </div>
      </article>
    </section>

    <section class="notice-band">
      Login e sincronização usam Supabase Auth e a tabela finance_states com regras de segurança por usuário. Os dados são salvos automaticamente na nuvem e cacheados neste dispositivo para uso offline.
    </section>
  `;

  $("#syncNow", container).addEventListener("click", () => persistAndRender("Dados enviados para a nuvem."));
  $("#signOutNow", container).addEventListener("click", signOut);
  $("#exportBackup", container).addEventListener("click", exportBackup);
  $("#backupInput", container).addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("#resetDemo", container).addEventListener("click", resetDemo);
}

function metricCard(label, value, sub, tone) {
  return `
    <article class="metric-card ${tone || ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${sub}</small>
    </article>
  `;
}

function transactionListItem(transaction) {
  const category = findCategory(transaction.categoryId);
  return `
    <li>
      <span>
        <strong>${escapeHtml(transaction.description)}</strong>
        <small class="muted">${DATE_FORMATTER.format(parseLocalDate(transaction.date))} · ${category ? escapeHtml(category.name) : "Sem categoria"}</small>
      </span>
      <strong class="${amountClass(transaction.type)}">${signedMoney(transaction)}</strong>
    </li>
  `;
}

function transactionRow(transaction) {
  const category = findCategory(transaction.categoryId);
  const payment = paymentDisplay(transaction);
  return `
    <tr>
      <td>${DATE_FORMATTER.format(parseLocalDate(transaction.date))}</td>
      <td>
        <strong>${escapeHtml(transaction.description)}</strong>
        ${transaction.note ? `<br><small class="muted">${escapeHtml(transaction.note)}</small>` : ""}
      </td>
      <td>${category ? escapeHtml(category.name) : "Sem categoria"}${transaction.subcategory ? `<br><small class="muted">${escapeHtml(transaction.subcategory)}</small>` : ""}</td>
      <td>${escapeHtml(payment || "Manual")}</td>
      <td>${tagPills(transaction.tags)}</td>
      <td class="${amountClass(transaction.type)}">${signedMoney(transaction)}</td>
      <td>
        <div class="inline-group" style="justify-content:flex-end">
          <button class="icon-button" type="button" title="Editar" data-action="edit-tx" data-id="${transaction.id}">✎</button>
          <button class="icon-button" type="button" title="Excluir" data-action="delete-tx" data-id="${transaction.id}">×</button>
        </div>
      </td>
    </tr>
  `;
}

function accountCard(account) {
  return `
    <article class="item-card">
      <div class="item-title">
        <div>
          <span class="inline-group"><span class="swatch" style="background:${account.color}"></span><strong>${escapeHtml(account.name)}</strong></span>
          <p class="muted">${escapeHtml(account.type)} · ${account.currency}</p>
        </div>
        <span class="pill">${account.currency}</span>
      </div>
      <strong>${money(account.balance, account.currency)}</strong>
      <small class="muted">Convertido: ${money(convertToBase(account.balance, account.currency))}</small>
      <div class="inline-group">
        <button class="secondary-action" type="button" data-action="edit-account" data-id="${account.id}">Editar</button>
        <button class="danger-action" type="button" data-action="delete-account" data-id="${account.id}">Excluir</button>
      </div>
    </article>
  `;
}

function budgetCard(budget) {
  const category = findCategory(budget.categoryId);
  const spent = categorySpent(budget.categoryId, budget.month);
  const percent = budget.limit ? (spent / budget.limit) * 100 : 0;
  const tone = percent >= 100 ? "danger" : percent >= 80 ? "warn" : "";
  return `
    <article class="item-card">
      <div class="item-title">
        <span class="inline-group"><span class="swatch" style="background:${category?.color || "#176b5b"}"></span><strong>${escapeHtml(category?.name || "Categoria")}</strong></span>
        <span class="pill ${tone === "danger" ? "danger" : tone === "warn" ? "warn" : ""}">${Math.round(percent)}%</span>
      </div>
      <div class="progress ${tone}" style="--value:${Math.min(100, percent)}%"><span></span></div>
      <p class="muted">${money(spent)} gastos de ${money(budget.limit)}</p>
      <div class="inline-group">
        <button class="secondary-action" type="button" data-action="edit-budget" data-id="${budget.id}">Editar</button>
        <button class="danger-action" type="button" data-action="delete-budget" data-id="${budget.id}">Excluir</button>
      </div>
    </article>
  `;
}

function goalCard(goal) {
  const percent = goal.target ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  return `
    <article class="item-card">
      <div class="item-title">
        <span class="inline-group"><span class="swatch" style="background:${goal.color}"></span><strong>${escapeHtml(goal.name)}</strong></span>
        <span class="pill">${Math.round(percent)}%</span>
      </div>
      <div>
        <strong>${money(goal.saved, goal.currency)}</strong>
        <p class="muted">Meta: ${money(goal.target, goal.currency)} · falta ${money(Math.max(0, goal.target - goal.saved), goal.currency)}</p>
      </div>
      <div class="progress blue" style="--value:${percent}%"><span></span></div>
      <small class="muted">Prazo: ${DATE_FORMATTER.format(parseLocalDate(goal.deadline))}</small>
      <div class="inline-group">
        <button class="primary-action" type="button" data-action="contribute-goal" data-id="${goal.id}">Aportar</button>
        <button class="secondary-action" type="button" data-action="edit-goal" data-id="${goal.id}">Editar</button>
        <button class="danger-action" type="button" data-action="delete-goal" data-id="${goal.id}">Excluir</button>
      </div>
    </article>
  `;
}

function recurringItem(transaction) {
  const category = findCategory(transaction.categoryId);
  return `
    <li>
      <div class="item-title">
        <span>
          <strong>${escapeHtml(transaction.description)}</strong>
          <small class="muted">${category ? escapeHtml(category.name) : "Sem categoria"} · dia ${transaction.date.slice(-2)}</small>
        </span>
        <span class="${amountClass(transaction.type)}">${signedMoney(transaction)}</span>
      </div>
    </li>
  `;
}

function ruleCard(rule) {
  const category = findCategory(rule.categoryId);
  return `
    <article class="item-card">
      <div class="item-title">
        <strong>${escapeHtml(rule.keyword)}</strong>
        <button class="icon-button" type="button" title="Excluir regra" data-action="delete-rule" data-id="${rule.id}">×</button>
      </div>
      <p class="muted">${category ? escapeHtml(category.name) : "Categoria"}${rule.subcategory ? ` › ${escapeHtml(rule.subcategory)}` : ""}</p>
    </article>
  `;
}

function categoryCard(category) {
  const txCount = state.transactions.filter((transaction) => transaction.categoryId === category.id).length;
  const budgetCount = state.budgets.filter((budget) => budget.categoryId === category.id).length;
  return `
    <article class="item-card">
      <div class="item-title">
        <span class="inline-group"><span class="swatch" style="background:${category.color}"></span><strong>${escapeHtml(category.name)}</strong></span>
        <span class="pill ${category.type === "income" ? "" : "neutral"}">${category.type === "income" ? "receita" : "despesa"}</span>
      </div>
      <p class="muted">${category.subcategories?.length ? category.subcategories.map(escapeHtml).join(", ") : "Sem subcategorias"}</p>
      <small class="muted">${txCount} lançamento(s) · ${budgetCount} orçamento(s)</small>
      <div class="inline-group">
        <button class="secondary-action" type="button" data-action="edit-category" data-id="${category.id}">Editar</button>
        <button class="danger-action" type="button" data-action="delete-category" data-id="${category.id}">Excluir</button>
      </div>
    </article>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function tagPills(tags) {
  const values = String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (!values.length) return `<span class="muted">-</span>`;
  return values.map((tag) => `<span class="pill neutral">${escapeHtml(tag)}</span>`).join(" ");
}

function openTransactionModal(transactionId = "") {
  const existing = transactionId ? findTransaction(transactionId) : null;
  const model = existing || {
    type: "expense",
    date: today(),
    description: "",
    amount: "",
    currency: state.settings.baseCurrency,
    accountId: state.accounts[0]?.id || "",
    cardId: "",
    destAccountId: "",
    destAmount: "",
    paymentMethod: existing?.paymentMethod || (existing?.cardId ? "credit" : "pix"),
    categoryId: state.categories.find((category) => category.type === "expense")?.id || "",
    subcategory: "",
    tags: "",
    location: "",
    note: "",
    recurring: false,
    installmentTotal: 1,
    attachmentName: ""
  };

  openModal(existing ? "Editar lançamento" : "Novo lançamento", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Tipo
        <select name="type" id="txType">
          <option value="expense" ${model.type === "expense" ? "selected" : ""}>Despesa</option>
          <option value="income" ${model.type === "income" ? "selected" : ""}>Receita</option>
          <option value="transfer" ${model.type === "transfer" ? "selected" : ""}>Transferência</option>
        </select>
      </label>
      <label class="field">
        Data
        <input name="date" type="date" value="${model.date}" required />
      </label>
      <label class="field">
        Descrição
        <input name="description" id="txDescription" value="${escapeAttr(model.description)}" required />
      </label>
      <label class="field">
        Valor
        <input name="amount" inputmode="decimal" value="${formatInputAmount(model.amount)}" required />
      </label>
      <label class="field">
        Forma de pagamento
        <select name="paymentMethod" id="paymentMethod">
          ${paymentMethodOptions(model)}
        </select>
      </label>
      <label class="field">
        Moeda
        <select name="currency">
          ${currencyOptions(model.currency)}
        </select>
      </label>
      <label class="field" id="paymentAccountField">
        <span id="paymentAccountLabel">Conta</span>
        <select name="accountId">
          <option value="">Sem conta</option>
          ${state.accounts.map((account) => `<option value="${account.id}" ${model.accountId === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field" id="destAccountField" hidden>
        Conta destino
        <select name="destAccountId">
          <option value="">Selecione</option>
          ${state.accounts.map((account) => `<option value="${account.id}" ${model.destAccountId === account.id ? "selected" : ""}>${escapeHtml(account.name)} (${account.currency})</option>`).join("")}
        </select>
      </label>
      <label class="field" id="destAmountField" hidden>
        Valor recebido (opcional)
        <input name="destAmount" inputmode="decimal" value="${model.destAmount ? formatInputAmount(model.destAmount) : ""}" placeholder="Se moedas diferentes" />
      </label>
      <label class="field" id="paymentCardField">
        Cartão
        <select name="cardId">
          <option value="">Sem cartão</option>
          ${state.cards.map((card) => `<option value="${card.id}" ${model.cardId === card.id ? "selected" : ""}>${escapeHtml(card.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field" id="installmentField">
        Parcelas
        <input name="installments" id="txInstallments" type="number" min="1" max="60" value="${existing?.installmentTotal || 1}" ${existing?.installmentGroupId ? "disabled" : ""} />
      </label>
      <label class="field">
        Categoria
        <select name="categoryId" id="txCategory"></select>
      </label>
      <label class="field">
        Subcategoria
        <select name="subcategory" id="txSubcategory"></select>
      </label>
      <label class="field">
        Tags
        <input name="tags" value="${escapeAttr(model.tags)}" placeholder="mercado, casa" />
      </label>
      <label class="field">
        Local
        <input name="location" value="${escapeAttr(model.location)}" />
      </label>
      <label class="field">
        Anexo
        <input name="attachment" type="file" accept="image/*,.pdf" />
      </label>
      <label class="field full">
        Observação
        <textarea name="note">${escapeHtml(model.note)}</textarea>
      </label>
      <label class="field full inline-group">
        <input name="recurring" type="checkbox" ${model.recurring ? "checked" : ""} />
        Repetir mensalmente
      </label>
      <p class="field full muted" id="installmentHint">No crédito, informe a data da compra. O app contabiliza a despesa no vencimento do cartão; se parcelar, cria uma parcela por mês.</p>
      <p class="field full muted" id="invoiceHint" hidden></p>
    </form>
  `, async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const file = form.elements.attachment.files[0];
    const installments = existing ? 1 : Math.max(1, Math.min(60, Number(data.installments) || 1));
    const rawType = data.type;
    const paymentMethod = rawType === "expense" ? data.paymentMethod : "account";
    const cardId = paymentMethod === "credit" ? data.cardId : "";
    const accountId = paymentMethod === "credit" ? "" : data.accountId;
    const card = cardId ? findCard(cardId) : null;
    const accountingDate = !existing && paymentMethod === "credit" && card ? nextCardDueDate(data.date, card) : data.date;
    const next = {
      ...model,
      id: existing?.id || uid("tx"),
      type: rawType,
      date: accountingDate,
      purchaseDate: paymentMethod === "credit" ? data.date : "",
      description: data.description.trim(),
      amount: parseAmount(data.amount),
      currency: data.currency,
      accountId,
      cardId,
      destAccountId: rawType === "transfer" ? (data.destAccountId || "") : "",
      destAmount: rawType === "transfer" && data.destAmount ? parseAmount(data.destAmount) : 0,
      paymentMethod,
      categoryId: rawType === "transfer" ? "" : data.categoryId,
      subcategory: rawType === "transfer" ? "" : data.subcategory,
      tags: data.tags,
      location: data.location,
      note: data.note,
      recurring: data.recurring === "on",
      installmentTotal: existing?.installmentTotal || installments,
      attachmentName: file?.name || model.attachmentName || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!next.amount || next.amount <= 0) {
      toast("Informe um valor maior que zero.");
      return false;
    }

    if (next.type === "expense" && paymentMethod !== "credit" && !next.accountId) {
      toast("Escolha a conta usada nesse pagamento.");
      return false;
    }

    if (next.type === "expense" && paymentMethod === "credit" && !next.cardId) {
      toast("Escolha o cartão de crédito.");
      return false;
    }

    if (next.type === "transfer") {
      if (!next.accountId || !next.destAccountId) {
        toast("Escolha a conta de origem e de destino.");
        return false;
      }
      if (next.accountId === next.destAccountId) {
        toast("Origem e destino precisam ser diferentes.");
        return false;
      }
    }

    if (!existing && paymentMethod === "credit" && installments > 1) {
      if (next.type !== "expense") {
        toast("Compra parcelada precisa ser uma despesa.");
        return false;
      }
      createInstallmentPurchase(next, installments);
      return true;
    }

    upsertTransaction(next, existing);
    return true;
  });

  const typeSelect = $("#txType", $("#modalRoot"));
  const categorySelect = $("#txCategory", $("#modalRoot"));
  const subcategorySelect = $("#txSubcategory", $("#modalRoot"));
  const descriptionInput = $("#txDescription", $("#modalRoot"));
  const paymentMethodSelect = $("#paymentMethod", $("#modalRoot"));
  const accountField = $("#paymentAccountField", $("#modalRoot"));
  const accountLabel = $("#paymentAccountLabel", $("#modalRoot"));
  const destAccountField = $("#destAccountField", $("#modalRoot"));
  const destAmountField = $("#destAmountField", $("#modalRoot"));
  const destAccountSelect = $("select[name=destAccountId]", $("#modalRoot"));
  const cardField = $("#paymentCardField", $("#modalRoot"));
  const installmentField = $("#installmentField", $("#modalRoot"));
  const installmentHint = $("#installmentHint", $("#modalRoot"));

  const invoiceHint = $("#invoiceHint", $("#modalRoot"));
  const cardSelect = $("select[name=cardId]", $("#modalRoot"));
  const dateInput = $("input[name=date]", $("#modalRoot"));
  const accountSelect = $("select[name=accountId]", $("#modalRoot"));

  const refreshInvoiceHint = () => {
    const isCredit = typeSelect.value === "expense" && paymentMethodSelect.value === "credit";
    const card = isCredit && cardSelect.value ? findCard(cardSelect.value) : null;
    if (!card || !dateInput.value) {
      invoiceHint.hidden = true;
      invoiceHint.textContent = "";
      return;
    }
    const invoiceMonth = invoiceMonthForPurchase(dateInput.value, card);
    const dueDate = invoiceDueDate(card, invoiceMonth);
    const linked = card.accountId ? findAccount(card.accountId) : null;
    const debitInfo = linked
      ? (card.autoPay
          ? `debitará automaticamente de ${linked.name} em ${formatShortDate(dueDate)}.`
          : `pagamento manual sai de ${linked.name}.`)
      : "vincule uma conta ao cartão para debitar automaticamente.";
    invoiceHint.textContent = `Esta compra entra na fatura de ${monthLabel(invoiceMonth)} (vence ${formatShortDate(dueDate)}) — ${debitInfo}`;
    invoiceHint.hidden = false;
  };

  const refreshTransferHint = () => {
    if (typeSelect.value !== "transfer") {
      destAmountField.hidden = true;
      return;
    }
    const from = findAccount(accountSelect.value);
    const to = findAccount(destAccountSelect.value);
    destAmountField.hidden = !(from && to && from.currency !== to.currency);
  };

  const refreshPaymentFields = () => {
    const type = typeSelect.value;
    const isExpense = type === "expense";
    const isTransfer = type === "transfer";
    const isCredit = isExpense && paymentMethodSelect.value === "credit";
    paymentMethodSelect.closest(".field").hidden = !isExpense;
    accountField.hidden = isCredit;
    accountLabel.textContent = isTransfer ? "Conta origem" : "Conta";
    destAccountField.hidden = !isTransfer;
    cardField.hidden = !isCredit;
    installmentField.hidden = !isCredit;
    installmentHint.hidden = !isCredit;
    // Categoria/subcategoria não fazem sentido em transferência
    categorySelect.closest(".field").hidden = isTransfer;
    subcategorySelect.closest(".field").hidden = isTransfer;
    refreshInvoiceHint();
    refreshTransferHint();
  };

  cardSelect.addEventListener("change", refreshInvoiceHint);
  dateInput.addEventListener("change", refreshInvoiceHint);
  accountSelect.addEventListener("change", refreshTransferHint);
  destAccountSelect.addEventListener("change", refreshTransferHint);

  cardSelect.addEventListener("change", refreshInvoiceHint);
  dateInput.addEventListener("change", refreshInvoiceHint);

  const refreshCategories = () => {
    if (typeSelect.value === "transfer") {
      categorySelect.innerHTML = "";
      subcategorySelect.innerHTML = "";
      return;
    }
    const available = state.categories.filter((category) => category.type === typeSelect.value);
    const selected = available.some((category) => category.id === model.categoryId) ? model.categoryId : available[0]?.id || "";
    categorySelect.innerHTML = available.map((category) => `<option value="${category.id}" ${selected === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("");
    refreshSubcategories();
  };

  const refreshSubcategories = () => {
    const category = findCategory(categorySelect.value);
    subcategorySelect.innerHTML = (category?.subcategories || [])
      .map((subcategory) => `<option value="${escapeAttr(subcategory)}" ${model.subcategory === subcategory ? "selected" : ""}>${escapeHtml(subcategory)}</option>`)
      .join("");
  };

  typeSelect.addEventListener("change", () => {
    refreshCategories();
    refreshPaymentFields();
  });
  paymentMethodSelect.addEventListener("change", refreshPaymentFields);
  categorySelect.addEventListener("change", refreshSubcategories);
  descriptionInput.addEventListener("blur", () => {
    if (!state.settings.autoCategorization || !descriptionInput.value.trim()) return;
    const suggestion = suggestCategory(descriptionInput.value);
    if (!suggestion) return;
    categorySelect.value = suggestion.categoryId;
    refreshSubcategories();
    subcategorySelect.value = suggestion.subcategory || "";
  });

  refreshCategories();
  refreshPaymentFields();
}

function openTransferModal() {
  if (state.accounts.length < 2) {
    toast("Cadastre pelo menos duas contas para transferir.");
    return;
  }
  openTransactionModal();
  // Após abrir o modal, seleciona o tipo Transferência e atualiza campos
  requestAnimationFrame(() => {
    const typeSelect = $("#txType", $("#modalRoot"));
    if (!typeSelect) return;
    typeSelect.value = "transfer";
    typeSelect.dispatchEvent(new Event("change"));
    const destSelect = $("select[name=destAccountId]", $("#modalRoot"));
    const srcSelect = $("select[name=accountId]", $("#modalRoot"));
    if (destSelect && srcSelect) {
      const other = state.accounts.find((a) => a.id !== srcSelect.value);
      if (other) {
        destSelect.value = other.id;
        destSelect.dispatchEvent(new Event("change"));
      }
    }
    const desc = $("#txDescription", $("#modalRoot"));
    if (desc && !desc.value) desc.value = "Transferência entre contas";
  });
}

function openAccountModal(accountId = "") {
  const existing = accountId ? findAccount(accountId) : null;
  const model = existing || { name: "", type: "Conta corrente", currency: state.settings.baseCurrency, balance: 0, color: "#176b5b" };

  openModal(existing ? "Editar conta" : "Nova conta", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Nome
        <input name="name" value="${escapeAttr(model.name)}" required />
      </label>
      <label class="field">
        Tipo
        <select name="type">
          ${["Conta corrente", "Poupança", "Carteira", "Investimento", "Internacional"].map((type) => `<option ${model.type === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        Moeda
        <select name="currency">${currencyOptions(model.currency)}</select>
      </label>
      <label class="field">
        Saldo
        <input name="balance" inputmode="decimal" value="${formatInputAmount(model.balance)}" required />
      </label>
      <label class="field">
        Cor
        <input name="color" type="color" value="${model.color}" />
      </label>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const next = {
      id: existing?.id || uid("acc"),
      name: data.name.trim(),
      type: data.type,
      currency: data.currency,
      balance: parseAmount(data.balance),
      color: data.color
    };
    if (existing) state.accounts = state.accounts.map((account) => (account.id === existing.id ? next : account));
    else state.accounts.push(next);
    persistAndRender("Conta salva.");
    return true;
  });
}

function openCardModal(cardId = "") {
  const existing = cardId ? findCard(cardId) : null;
  const model = existing || {
    name: "", brand: "Visa", limit: 3000, closingDay: 10, dueDay: 18,
    color: "#13201c", accountId: state.accounts[0]?.id || "", autoPay: true
  };

  openModal(existing ? "Editar cartão" : "Novo cartão", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Nome
        <input name="name" value="${escapeAttr(model.name)}" required />
      </label>
      <label class="field">
        Bandeira
        <input name="brand" value="${escapeAttr(model.brand)}" required />
      </label>
      <label class="field">
        Limite
        <input name="limit" inputmode="decimal" value="${formatInputAmount(model.limit)}" required />
      </label>
      <label class="field">
        Fechamento (dia)
        <input name="closingDay" type="number" min="1" max="31" value="${model.closingDay}" required />
      </label>
      <label class="field">
        Vencimento (dia)
        <input name="dueDay" type="number" min="1" max="31" value="${model.dueDay}" required />
      </label>
      <label class="field">
        Conta de débito da fatura
        <select name="accountId">
          <option value="">Escolher na hora de pagar</option>
          ${state.accounts.map((account) => `<option value="${account.id}" ${model.accountId === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field full inline-group">
        <input name="autoPay" type="checkbox" ${model.autoPay ? "checked" : ""} />
        Pagar fatura automaticamente no vencimento (debita da conta acima)
      </label>
      <label class="field">
        Cor
        <input name="color" type="color" value="${model.color}" />
      </label>
      <p class="field full muted">O saldo da conta só é debitado quando a fatura vence. Compras no cartão ficam separadas em cada fatura mensal.</p>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const next = {
      id: existing?.id || uid("card"),
      name: data.name.trim(),
      brand: data.brand.trim(),
      limit: parseAmount(data.limit),
      closingDay: Number(data.closingDay),
      dueDay: Number(data.dueDay),
      color: data.color,
      accountId: data.accountId || "",
      autoPay: data.autoPay === "on"
    };
    if (next.autoPay && !next.accountId) {
      toast("Para pagar automaticamente, escolha uma conta de débito.");
      return false;
    }
    if (existing) state.cards = state.cards.map((card) => (card.id === existing.id ? next : card));
    else state.cards.push(next);
    persistAndRender("Cartão salvo.");
    return true;
  });
}

function openBudgetModal(budgetId = "") {
  const existing = budgetId ? state.budgets.find((budget) => budget.id === budgetId) : null;
  const model = existing || { month: state.settings.selectedMonth, categoryId: state.categories.find((category) => category.type === "expense")?.id || "", limit: 0 };

  openModal(existing ? "Editar orçamento" : "Novo orçamento", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Mês
        <input name="month" type="month" value="${model.month}" required />
      </label>
      <label class="field">
        Categoria
        <select name="categoryId">
          ${state.categories
            .filter((category) => category.type === "expense")
            .map((category) => `<option value="${category.id}" ${model.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`)
            .join("")}
        </select>
      </label>
      <label class="field">
        Limite
        <input name="limit" inputmode="decimal" value="${formatInputAmount(model.limit)}" required />
      </label>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const next = { id: existing?.id || uid("bud"), month: data.month, categoryId: data.categoryId, limit: parseAmount(data.limit) };
    if (existing) state.budgets = state.budgets.map((budget) => (budget.id === existing.id ? next : budget));
    else state.budgets.push(next);
    persistAndRender("Orçamento salvo.");
    return true;
  });
}

function openGoalModal(goalId = "") {
  const existing = goalId ? state.goals.find((goal) => goal.id === goalId) : null;
  const model = existing || { name: "", target: 0, saved: 0, deadline: today(), currency: state.settings.baseCurrency, color: "#176b5b" };

  openModal(existing ? "Editar meta" : "Nova meta", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Nome
        <input name="name" value="${escapeAttr(model.name)}" required />
      </label>
      <label class="field">
        Prazo
        <input name="deadline" type="date" value="${model.deadline}" required />
      </label>
      <label class="field">
        Valor alvo
        <input name="target" inputmode="decimal" value="${formatInputAmount(model.target)}" required />
      </label>
      <label class="field">
        Valor guardado
        <input name="saved" inputmode="decimal" value="${formatInputAmount(model.saved)}" required />
      </label>
      <label class="field">
        Moeda
        <select name="currency">${currencyOptions(model.currency)}</select>
      </label>
      <label class="field">
        Cor
        <input name="color" type="color" value="${model.color}" />
      </label>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const next = {
      id: existing?.id || uid("goal"),
      name: data.name.trim(),
      target: parseAmount(data.target),
      saved: parseAmount(data.saved),
      deadline: data.deadline,
      currency: data.currency,
      color: data.color
    };
    if (existing) state.goals = state.goals.map((goal) => (goal.id === existing.id ? next : goal));
    else state.goals.push(next);
    persistAndRender("Meta salva.");
    return true;
  });
}

function openContributionModal(goalId) {
  const goal = state.goals.find((item) => item.id === goalId);
  if (!goal) return;

  openModal("Aportar na meta", `
    <form id="modalForm" class="form-grid">
      <label class="field full">
        Valor
        <input name="amount" inputmode="decimal" required />
      </label>
    </form>
  `, (form) => {
    const amount = parseAmount(new FormData(form).get("amount"));
    goal.saved = Math.min(goal.target, goal.saved + amount);
    persistAndRender("Aporte registrado.");
    return true;
  });
}

function openRatesModal() {
  openModal("Taxas de conversão", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Moeda base
        <select name="baseCurrency">${currencyOptions(state.settings.baseCurrency)}</select>
      </label>
      ${Object.entries(state.settings.rates)
        .map(([currency, rate]) => `
          <label class="field">
            1 ${currency} em BRL
            <input name="rate_${currency}" inputmode="decimal" value="${formatInputAmount(rate)}" required />
          </label>
        `)
        .join("")}
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    state.settings.baseCurrency = data.baseCurrency;
    Object.keys(state.settings.rates).forEach((currency) => {
      state.settings.rates[currency] = parseAmount(data[`rate_${currency}`]);
    });
    persistAndRender("Moedas atualizadas.");
    return true;
  });
}

function openRuleModal() {
  openModal("Nova regra inteligente", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Palavra-chave
        <input name="keyword" required />
      </label>
      <label class="field">
        Categoria
        <select name="categoryId" id="ruleCategory">
          ${state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field full">
        Subcategoria
        <input name="subcategory" />
      </label>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    state.rules.push({ id: uid("rule"), keyword: data.keyword.trim().toLowerCase(), categoryId: data.categoryId, subcategory: data.subcategory.trim() });
    persistAndRender("Regra criada.");
    return true;
  });
}

function openCategoryModal(categoryId = "") {
  const existing = categoryId ? findCategory(categoryId) : null;
  const model = existing || {
    type: "expense",
    name: "",
    subcategories: [],
    color: "#176b5b"
  };

  openModal(existing ? "Editar categoria" : "Nova categoria", `
    <form id="modalForm" class="form-grid">
      <label class="field">
        Nome
        <input name="name" value="${escapeAttr(model.name)}" required />
      </label>
      <label class="field">
        Tipo
        <select name="type">
          <option value="expense" ${model.type === "expense" ? "selected" : ""}>Despesa</option>
          <option value="income" ${model.type === "income" ? "selected" : ""}>Receita</option>
        </select>
      </label>
      <label class="field">
        Cor
        <input name="color" type="color" value="${model.color || "#176b5b"}" />
      </label>
      <label class="field full">
        Subcategorias
        <textarea name="subcategories" placeholder="Ex: Supermercado, Restaurante, Delivery">${escapeHtml((model.subcategories || []).join(", "))}</textarea>
      </label>
    </form>
  `, (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const subcategories = String(data.subcategories || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const next = {
      id: existing?.id || uid("cat"),
      type: data.type,
      name: data.name.trim(),
      subcategories,
      color: data.color
    };

    if (existing) {
      state.categories = state.categories.map((category) => (category.id === existing.id ? next : category));
    } else {
      state.categories.push(next);
    }

    persistAndRender("Categoria salva.");
    return true;
  });
}

function openModal(title, bodyHtml, onSubmit) {
  const root = $("#modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header class="modal-header">
          <h2 id="modalTitle">${escapeHtml(title)}</h2>
          <button class="icon-button" type="button" data-close-modal title="Fechar">×</button>
        </header>
        <div class="modal-body">${bodyHtml}</div>
        <footer class="modal-footer">
          <button class="ghost-action" type="button" data-close-modal>Cancelar</button>
          <button class="primary-action" type="submit" form="modalForm">Salvar</button>
        </footer>
      </section>
    </div>
  `;

  const close = () => {
    root.innerHTML = "";
  };

  $$("[data-close-modal]", root).forEach((button) => button.addEventListener("click", close));
  $(".modal-backdrop", root).addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) close();
  });

  const form = $("#modalForm", root);
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const shouldClose = await onSubmit(form);
      if (shouldClose !== false) close();
    });
    const firstInput = $("input, select, textarea", form);
    if (firstInput) firstInput.focus();
  }
}

function upsertTransaction(next, existing = null) {
  const amount = Number(next.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Informe um valor válido maior que zero.");
    return;
  }
  next.amount = Math.round(amount * 100) / 100;
  if (!next.date || Number.isNaN(new Date(next.date).getTime())) {
    toast("Data inválida.");
    return;
  }
  if (existing) {
    applyTransactionImpact(existing, -1);
    state.transactions = state.transactions.map((transaction) => (transaction.id === existing.id ? next : transaction));
  } else {
    state.transactions.unshift(next);
  }
  applyTransactionImpact(next, 1);
  persistAndRender(existing ? "Lançamento atualizado." : "Lançamento criado.");
}

function createInstallmentPurchase(baseTransaction, installments) {
  const groupId = uid("inst");
  const total = Number(baseTransaction.amount) || 0;
  const baseAmount = Math.floor((total / installments) * 100) / 100;
  let accumulated = 0;
  const created = [];

  for (let index = 1; index <= installments; index += 1) {
    const isLast = index === installments;
    const amount = isLast ? Math.round((total - accumulated) * 100) / 100 : baseAmount;
    accumulated += amount;

    const transaction = {
      ...baseTransaction,
      id: uid("tx"),
      date: addMonthsToDate(baseTransaction.date, index - 1),
      description: `${baseTransaction.description} (${index}/${installments})`,
      amount,
      recurring: false,
      installmentGroupId: groupId,
      installmentIndex: index,
      installmentTotal: installments,
      installmentTotalAmount: total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    created.push(transaction);
  }

  state.transactions.unshift(...created.reverse());
  persistAndRender(`${installments} parcelas criadas.`);
}

function deleteTransaction(id) {
  const transaction = findTransaction(id);
  if (!transaction || !confirm("Excluir este lançamento?")) return;
  const deleteGroup = transaction.installmentGroupId && confirm("Esta compra é parcelada. Clique em OK para excluir todas as parcelas, ou Cancelar para excluir só esta parcela.");
  const toDelete = deleteGroup
    ? state.transactions.filter((item) => item.installmentGroupId === transaction.installmentGroupId)
    : [transaction];
  toDelete.forEach((item) => applyTransactionImpact(item, -1));
  const ids = new Set(toDelete.map((item) => item.id));
  state.transactions = state.transactions.filter((item) => !ids.has(item.id));
  persistAndRender(deleteGroup ? "Compra parcelada excluída." : "Lançamento excluído.");
}

function applyTransactionImpact(transaction, direction) {
  if (transaction.date > today()) return;
  const account = findAccount(transaction.accountId);
  if (transaction.type === "income" && account) account.balance += transaction.amount * direction;
  if (transaction.type === "expense" && !transaction.cardId && account) account.balance -= transaction.amount * direction;
  if (transaction.type === "transfer") {
    if (account) account.balance -= transaction.amount * direction;
    // Transferência entre contas: credita a conta destino (converte moeda se necessário)
    if (transaction.destAccountId) {
      const dest = findAccount(transaction.destAccountId);
      if (dest) {
        const credited = Number(transaction.destAmount) > 0
          ? Number(transaction.destAmount)
          : transaction.amount;
        dest.balance += credited * direction;
      }
    }
  }
}

function deleteAccount(id) {
  if (state.transactions.some((transaction) => transaction.accountId === id)) {
    toast("Esta conta tem lançamentos vinculados.");
    return;
  }
  if (!confirm("Excluir esta conta?")) return;
  state.accounts = state.accounts.filter((account) => account.id !== id);
  persistAndRender("Conta excluída.");
}

function deleteCard(id) {
  if (state.transactions.some((transaction) => transaction.cardId === id)) {
    toast("Este cartão tem lançamentos vinculados.");
    return;
  }
  if (!confirm("Excluir este cartão?")) return;
  state.cards = state.cards.filter((card) => card.id !== id);
  persistAndRender("Cartão excluído.");
}

function payCardInvoice(cardId, month) {
  const card = findCard(cardId);
  if (!card) return;
  const invoiceMonth = month || openInvoiceMonth(card);
  const amount = cardOutstanding(cardId, invoiceMonth);
  if (amount <= 0) {
    toast("Fatura já quitada.");
    return;
  }
  const account = (card.accountId && findAccount(card.accountId))
    || state.accounts.find((item) => item.currency === state.settings.baseCurrency)
    || state.accounts[0];
  if (!account) {
    toast("Cadastre uma conta antes de pagar a fatura.");
    return;
  }
  const dueDate = invoiceDueDate(card, invoiceMonth);
  const paymentDate = dueDate <= today() ? dueDate : today();
  registerCardInvoicePayment(card, account, invoiceMonth, amount, paymentDate, false);
  persistAndRender(`Pagamento de ${money(amount)} registrado em ${escapeHtml(account.name)}.`);
}

function registerCardInvoicePayment(card, account, invoiceMonth, amount, dateStr, auto) {
  const payment = {
    id: uid("tx"),
    type: "transfer",
    date: dateStr,
    description: `Pagamento fatura ${card.name} (${monthLabel(invoiceMonth)})`,
    amount,
    currency: state.settings.baseCurrency,
    accountId: account.id,
    cardId: card.id,
    categoryId: "",
    subcategory: "",
    tags: auto ? "cartao,auto" : "cartao",
    location: "",
    note: auto ? "Pagamento automático da fatura no vencimento." : "Baixa de fatura sem duplicar despesa no relatório.",
    recurring: false,
    attachmentName: "",
    invoiceMonth,
    autoPayment: !!auto,
    createdAt: new Date().toISOString()
  };
  state.transactions.unshift(payment);
  applyTransactionImpact(payment, 1);
  return payment;
}

function runAutoCardPayments() {
  if (!state || !Array.isArray(state.cards)) return false;
  let changed = false;
  const todayStr = today();
  state.cards.forEach((card) => {
    if (!card.autoPay || !card.accountId) return;
    const account = findAccount(card.accountId);
    if (!account) return;
    // Percorre até 12 meses passados procurando faturas vencidas em aberto.
    for (let offset = -12; offset <= 0; offset += 1) {
      const invoiceMonth = shiftMonth(state.settings.selectedMonth, offset);
      const dueDate = invoiceDueDate(card, invoiceMonth);
      if (dueDate > todayStr) continue;
      const outstanding = cardOutstanding(card.id, invoiceMonth);
      if (outstanding <= 0.005) continue;
      registerCardInvoicePayment(card, account, invoiceMonth, outstanding, dueDate, true);
      changed = true;
    }
  });
  return changed;
}

function deleteBudget(id) {
  if (!confirm("Excluir este orçamento?")) return;
  state.budgets = state.budgets.filter((budget) => budget.id !== id);
  persistAndRender("Orçamento excluído.");
}

function copyPreviousBudgets() {
  const month = state.settings.selectedMonth;
  const previous = shiftMonth(month, -1);
  const previousBudgets = state.budgets.filter((budget) => budget.month === previous);
  if (!previousBudgets.length) {
    toast("Não há orçamentos no mês anterior.");
    return;
  }
  const existingKeys = new Set(state.budgets.filter((budget) => budget.month === month).map((budget) => budget.categoryId));
  previousBudgets.forEach((budget) => {
    if (!existingKeys.has(budget.categoryId)) {
      state.budgets.push({ ...budget, id: uid("bud"), month });
    }
  });
  persistAndRender("Orçamentos copiados.");
}

function deleteGoal(id) {
  if (!confirm("Excluir esta meta?")) return;
  state.goals = state.goals.filter((goal) => goal.id !== id);
  persistAndRender("Meta excluída.");
}

function deleteRule(id) {
  if (!confirm("Excluir esta regra?")) return;
  state.rules = state.rules.filter((rule) => rule.id !== id);
  persistAndRender("Regra excluída.");
}

function deleteCategory(id) {
  const category = findCategory(id);
  if (!category) return;
  const txCount = state.transactions.filter((transaction) => transaction.categoryId === id).length;
  const budgetCount = state.budgets.filter((budget) => budget.categoryId === id).length;
  const ruleCount = state.rules.filter((rule) => rule.categoryId === id).length;

  if (txCount || budgetCount || ruleCount) {
    toast("Esta categoria está em uso. Edite o nome/subcategorias em vez de excluir.");
    return;
  }

  if (!confirm(`Excluir a categoria "${category.name}"?`)) return;
  state.categories = state.categories.filter((item) => item.id !== id);
  persistAndRender("Categoria excluída.");
}

function processRecurringForMonth() {
  const month = state.settings.selectedMonth;
  let created = 0;
  const templates = state.transactions.filter((transaction) => transaction.recurring && !transaction.parentRecurringId);

  templates.forEach((template) => {
    if (template.date.slice(0, 7) === month) return;
    const alreadyExists = state.transactions.some((transaction) => transaction.parentRecurringId === template.id && transaction.date.slice(0, 7) === month);
    if (alreadyExists) return;
    const copy = {
      ...template,
      id: uid("tx"),
      date: `${month}-${template.date.slice(-2)}`,
      parentRecurringId: template.id,
      createdAt: new Date().toISOString()
    };
    state.transactions.unshift(copy);
    applyTransactionImpact(copy, 1);
    created += 1;
  });

  persistAndRender(created ? `${created} recorrência(s) processada(s).` : "Nada novo para processar.");
}

function importStatement(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result));
    if (!rows.length) {
      toast("CSV vazio.");
      return;
    }

    const headers = rows[0].map((header) => header.toLowerCase().trim());
    const dataRows = headers.includes("data") || headers.includes("date") ? rows.slice(1) : rows;
    let imported = 0;

    dataRows.forEach((row) => {
      const record = headers.includes("data") || headers.includes("date") ? objectFromRow(headers, row) : null;
      const date = normalizeDate(record?.data || record?.date || row[0]);
      const description = record?.descricao || record?.descrição || record?.description || row[1] || "Importado do extrato";
      const amount = parseAmount(record?.valor || record?.amount || row[2]);
      const typeText = String(record?.tipo || record?.type || row[3] || "").toLowerCase();
      const type = /rece|income|entrada|credit|crédito/.test(typeText) ? "income" : amount < 0 ? "expense" : "expense";
      const suggestion = suggestCategory(description, type);
      const account = state.accounts[0];
      const transaction = {
        id: uid("tx"),
        type,
        date,
        description,
        amount: Math.abs(amount),
        currency: record?.moeda || record?.currency || account?.currency || state.settings.baseCurrency,
        accountId: account?.id || "",
        cardId: "",
        categoryId: suggestion?.categoryId || state.categories.find((category) => category.type === type)?.id || "",
        subcategory: suggestion?.subcategory || "",
        tags: "extrato",
        location: "",
        note: "",
        recurring: false,
        attachmentName: file.name,
        createdAt: new Date().toISOString()
      };
      state.transactions.unshift(transaction);
      applyTransactionImpact(transaction, 1);
      imported += 1;
    });

    persistAndRender(`${imported} lançamento(s) importado(s).`);
  };
  reader.readAsText(file, "utf-8");
}

function filteredTransactions(container) {
  const search = $("#txSearch", container).value.toLowerCase().trim();
  const type = $("#txTypeFilter", container).value;
  const category = $("#txCategoryFilter", container).value;
  const payment = $("#txPaymentFilter", container).value;
  const month = state.settings.selectedMonth;

  return state.transactions
    .filter((transaction) => {
      if (transaction.date.slice(0, 7) !== month) return false;
      const haystack = [transaction.description, transaction.tags, transaction.location, transaction.note, transaction.subcategory].join(" ").toLowerCase();
      const paymentMatch = !payment || (payment.startsWith("acc:") && transaction.accountId === payment.slice(4)) || (payment.startsWith("card:") && transaction.cardId === payment.slice(5));
      return (!search || haystack.includes(search)) && (!type || transaction.type === type) && (!category || transaction.categoryId === category) && paymentMatch;
    })
    .sort(sortByDateDesc);
}

function exportTransactions(format, transactions) {
  const rows = [
    ["data", "tipo", "descricao", "valor", "moeda", "categoria", "subcategoria", "conta", "cartao", "tags", "local", "observacao"],
    ...transactions.map((transaction) => [
      transaction.date,
      transaction.type,
      transaction.description,
      transaction.amount,
      transaction.currency,
      findCategory(transaction.categoryId)?.name || "",
      transaction.subcategory || "",
      findAccount(transaction.accountId)?.name || "",
      findCard(transaction.cardId)?.name || "",
      transaction.tags || "",
      transaction.location || "",
      transaction.note || ""
    ])
  ];

  if (format === "csv") {
    downloadBlob(`lancamentos-${state.settings.selectedMonth}.csv`, toCsv(rows), "text/csv;charset=utf-8");
    return;
  }

  const html = `
    <html><head><meta charset="UTF-8"></head><body>
      <table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</table>
    </body></html>
  `;
  downloadBlob(`lancamentos-${state.settings.selectedMonth}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
}

function exportBackup() {
  downloadBlob(`precis-finance-backup-${today()}.json`, JSON.stringify(state, null, 2), "application/json;charset=utf-8");
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(String(reader.result)));
      persistAndRender("Backup importado.");
    } catch {
      toast("Não foi possível ler este backup.");
    }
  };
  reader.readAsText(file, "utf-8");
}

function resetDemo() {
  if (!confirm("Resetar todos os dados da sua conta?")) return;
  state = createSeedState();
  persistAndRender("Dados resetados e enviados para a nuvem.");
}

let persistTimer = null;
function persist() {
  // Debounce: agrupa múltiplas edições em uma única chamada à nuvem.
  if (persistTimer) clearTimeout(persistTimer);
  return new Promise((resolve) => {
    persistTimer = setTimeout(async () => {
      persistTimer = null;
      await saveCloudState();
      resolve();
    }, 400);
  });
}

async function persistAndRender(message) {
  await persist();
  hydratePeriodSelect();
  render();
  if (message) toast(message);
}

function monthlyTotals(month) {
  // Fluxo de caixa do mês: considera apenas movimentações que impactam o saldo das contas.
  // Compras no cartão de crédito NÃO entram como despesa até que a fatura seja paga
  // (o pagamento da fatura é um "transfer" com cardId e é contabilizado como despesa aqui).
  return getMonthTransactions(month).reduce(
    (acc, transaction) => {
      const value = convertToBase(transaction.amount, transaction.currency);
      if (transaction.type === "income") {
        acc.income += value;
      } else if (transaction.type === "expense") {
        // Ignora despesas lançadas no cartão de crédito — elas só afetam o caixa quando a fatura é paga.
        if (!transaction.cardId) acc.expense += value;
      } else if (transaction.type === "transfer" && transaction.cardId) {
        // Pagamento de fatura de cartão: saída real de caixa no mês do pagamento.
        acc.expense += value;
      }
      acc.balance = acc.income - acc.expense;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );
}

function totalPatrimony() {
  return state.accounts.reduce((sum, account) => sum + convertToBase(account.balance, account.currency), 0);
}

function getMonthTransactions(month) {
  return state.transactions.filter((transaction) => transaction.date.slice(0, 7) === month);
}

function expenseByCategory(month) {
  const map = new Map();
  getMonthTransactions(month)
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      const category = findCategory(transaction.categoryId) || { id: "none", name: "Sem categoria", color: "#65716d" };
      const current = map.get(category.id) || { name: category.name, color: category.color, total: 0 };
      current.total += convertToBase(transaction.amount, transaction.currency);
      map.set(category.id, current);
    });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function categorySpent(categoryId, month) {
  return getMonthTransactions(month)
    .filter((transaction) => transaction.type === "expense" && transaction.categoryId === categoryId)
    .reduce((sum, transaction) => sum + convertToBase(transaction.amount, transaction.currency), 0);
}

function cardSpent(cardId, month) {
  return getMonthTransactions(month)
    .filter((transaction) => transaction.type === "expense" && transaction.cardId === cardId)
    .reduce((sum, transaction) => sum + convertToBase(transaction.amount, transaction.currency), 0);
}

function cardPayments(cardId, month) {
  return getMonthTransactions(month)
    .filter((transaction) => transaction.type === "transfer" && transaction.cardId === cardId)
    .reduce((sum, transaction) => sum + convertToBase(transaction.amount, transaction.currency), 0);
}

function cardOutstanding(cardId, month) {
  return Math.max(0, cardSpent(cardId, month) - cardPayments(cardId, month));
}

function budgetAlerts(month) {
  return state.budgets
    .filter((budget) => budget.month === month)
    .map((budget) => {
      const spent = categorySpent(budget.categoryId, month);
      const percent = budget.limit ? (spent / budget.limit) * 100 : 0;
      const category = findCategory(budget.categoryId);
      if (percent < 50) return null;
      return {
        percent,
        level: percent >= 100 ? "danger" : "warning",
        title: `${category?.name || "Categoria"} em ${Math.round(percent)}%`,
        message: `${money(spent)} usados de ${money(budget.limit)} no orçamento.`
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.percent - a.percent);
}

function savingsRate(month) {
  const totals = monthlyTotals(month);
  if (!totals.income) return 0;
  return Math.round((totals.balance / totals.income) * 100);
}

function suggestCategory(text, type = "expense") {
  const lower = String(text || "").toLowerCase();
  const rule = state.rules.find((item) => lower.includes(item.keyword.toLowerCase()));
  if (rule) return { categoryId: rule.categoryId, subcategory: rule.subcategory };
  const category = state.categories.find((item) => item.type === type);
  return category ? { categoryId: category.id, subcategory: category.subcategories[0] || "" } : null;
}

function drawCashflowChart(canvasId) {
  const months = lastMonths(state.settings.selectedMonth, 6);
  const income = months.map((month) => monthlyTotals(month).income);
  const expense = months.map((month) => monthlyTotals(month).expense);
  drawLineChart(canvasId, months.map(shortMonthLabel), [
    { label: "Receitas", color: "#26966f", values: income },
    { label: "Despesas", color: "#cf4f45", values: expense }
  ]);
}

function drawCategoryChart(canvasId, legendId, month) {
  const data = expenseByCategory(month);
  drawDonutChart(canvasId, data);
  const legend = $(`#${legendId}`);
  legend.innerHTML = data.length
    ? data
        .map((item) => `
          <li>
            <span class="inline-group"><span class="legend-dot" style="background:${item.color}"></span>${escapeHtml(item.name)}</span>
            <strong>${money(item.total)}</strong>
          </li>
        `)
        .join("")
    : `<li class="muted">Sem despesas no mês.</li>`;
}

function drawAnnualChart(canvasId) {
  const year = state.settings.selectedMonth.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
  drawLineChart(canvasId, months.map(shortMonthLabel), [
    { label: "Receitas", color: "#26966f", values: months.map((month) => monthlyTotals(month).income) },
    { label: "Despesas", color: "#cf4f45", values: months.map((month) => monthlyTotals(month).expense) },
    { label: "Saldo", color: "#4267b2", values: months.map((month) => monthlyTotals(month).balance) }
  ]);
}

function drawLineChart(canvasId, labels, series) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas, 260);
  const padding = { top: 22, right: 18, bottom: 34, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = series.flatMap((item) => item.values);
  const max = Math.max(100, ...values);
  const min = Math.min(0, ...values);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#dfe6e2";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#65716d";
  ctx.font = "12px Inter, sans-serif";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  labels.forEach((label, index) => {
    const x = padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index;
    ctx.fillText(label, x - 14, height - 10);
  });

  series.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    item.values.forEach((value, index) => {
      const x = padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index;
      const y = padding.top + chartHeight - ((value - min) / Math.max(1, max - min)) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    item.values.forEach((value, index) => {
      const x = padding.left + (chartWidth / Math.max(1, labels.length - 1)) * index;
      const y = padding.top + chartHeight - ((value - min) / Math.max(1, max - min)) * chartHeight;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawDonutChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas, 260);
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;

  ctx.clearRect(0, 0, width, height);
  if (!total) {
    ctx.fillStyle = "#65716d";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sem dados", cx, cy);
    return;
  }

  let start = -Math.PI / 2;
  data.forEach((item, index) => {
    const angle = (item.total / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.strokeStyle = item.color || categoryColors[index % categoryColors.length];
    ctx.lineWidth = 34;
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.stroke();
    start += angle;
  });

  ctx.fillStyle = "#18201d";
  ctx.font = "800 18px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(money(total), cx, cy + 4);
  ctx.fillStyle = "#65716d";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText("despesas", cx, cy + 24);
}

function prepareCanvas(canvas, height) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width || canvas.parentElement?.clientWidth || 320);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function findTransaction(id) {
  return state.transactions.find((transaction) => transaction.id === id);
}

function findAccount(id) {
  return state.accounts.find((account) => account.id === id);
}

function findCard(id) {
  return state.cards.find((card) => card.id === id);
}

function findCategory(id) {
  return state.categories.find((category) => category.id === id);
}

function currentMonth() {
  return today().slice(0, 7);
}

function today() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day || 1);
}

function monthLabel(month) {
  return MONTH_FORMATTER.format(parseLocalDate(`${month}-01`));
}

function shortMonthLabel(month) {
  return parseLocalDate(`${month}-01`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function shiftMonth(month, delta) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsToDate(value, delta) {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(year, month - 1 + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function invoiceMonthForPurchase(purchaseDate, card) {
  return nextCardDueDate(purchaseDate, card).slice(0, 7);
}

function invoiceDueDate(card, month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const dueDay = Math.max(1, Math.min(31, Number(card.dueDay) || 1));
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function invoiceClosingDate(card, month) {
  // Fatura que vence em `month` fecha no ciclo anterior.
  const dueDay = Math.max(1, Math.min(31, Number(card.dueDay) || 1));
  const closingDay = Math.max(1, Math.min(31, Number(card.closingDay) || 1));
  const closingMonth = closingDay < dueDay ? month : shiftMonth(month, -1);
  const [year, monthIndex] = closingMonth.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const day = Math.min(closingDay, lastDay);
  return `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function openInvoiceMonth(card) {
  // Compra hoje entra em qual fatura?
  return invoiceMonthForPurchase(today(), card);
}

function cardCommittedTotal(cardId) {
  // Soma tudo que ainda não foi pago (faturas em aberto no futuro).
  return state.transactions
    .filter((t) => t.type === "expense" && t.cardId === cardId)
    .reduce((sum, t) => sum + convertToBase(t.amount, t.currency), 0)
    - state.transactions
      .filter((t) => t.type === "transfer" && t.cardId === cardId)
      .reduce((sum, t) => sum + convertToBase(t.amount, t.currency), 0);
}

function cardInvoiceList(card, count = 4) {
  const open = openInvoiceMonth(card);
  const months = [];
  for (let offset = -2; offset < count - 2; offset += 1) {
    months.push(shiftMonth(open, offset));
  }
  const todayStr = today();
  return months.map((month) => {
    const total = cardSpent(card.id, month);
    const paid = cardPayments(card.id, month);
    const outstanding = Math.max(0, total - paid);
    const dueDate = invoiceDueDate(card, month);
    const closingDate = invoiceClosingDate(card, month);
    let status = "future";
    if (paid > 0 && outstanding <= 0.005) status = "paid";
    else if (dueDate < todayStr && outstanding > 0) status = "overdue";
    else if (closingDate <= todayStr) status = "closed";
    else if (month === open) status = "open";
    return { month, total, paid, outstanding, dueDate, closingDate, status };
  });
}

function invoiceStatusLabel(inv) {
  if (inv.status === "paid") return "Paga";
  if (inv.status === "overdue") return "Vencida";
  if (inv.status === "closed") return "Fechada";
  if (inv.status === "open") return "Aberta";
  return "Prevista";
}

function formatShortDate(value) {
  if (!value) return "-";
  return parseLocalDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function nextCardDueDate(purchaseDate, card) {
  const [year, month, day] = purchaseDate.split("-").map(Number);
  const dueDay = Math.max(1, Math.min(31, Number(card.dueDay) || day));
  const closingDay = Math.max(1, Math.min(31, Number(card.closingDay) || day));
  let monthOffset = day > closingDay ? 1 : 0;
  if (dueDay <= closingDay) monthOffset += 1;
  const base = new Date(year, month - 1 + monthOffset, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(dueDay, lastDay));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function lastMonths(month, count) {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1));
}

function sortByDateDesc(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt || "") || 0;
}

function money(value, currency = state?.settings?.baseCurrency || "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value) || 0);
}

function signedMoney(transaction) {
  const sign = transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : "↔ ";
  return `${sign}${money(transaction.amount, transaction.currency)}`;
}

function paymentDisplay(transaction) {
  if (transaction.cardId) {
    const card = findCard(transaction.cardId)?.name || "Cartão";
    return `${paymentMethodLabel(transaction.paymentMethod || "credit")} · ${card}`;
  }
  if (transaction.type === "transfer" && transaction.destAccountId) {
    const from = findAccount(transaction.accountId)?.name || "Conta";
    const to = findAccount(transaction.destAccountId)?.name || "Conta";
    return `Transferência · ${from} → ${to}`;
  }
  const account = findAccount(transaction.accountId)?.name || "Conta";
  return `${paymentMethodLabel(transaction.paymentMethod || "account")} · ${account}`;
}

function paymentMethodLabel(method) {
  const labels = {
    cash: "À vista",
    pix: "Pix",
    debit: "Débito",
    account: "Conta",
    credit: "Crédito"
  };
  return labels[method] || "Conta";
}

function amountClass(type) {
  if (type === "income") return "amount-income";
  if (type === "expense") return "amount-expense";
  return "amount-transfer";
}

function convertToBase(value, currency) {
  const rates = state.settings.rates;
  const base = state.settings.baseCurrency;
  return (Number(value) || 0) * (rates[currency] || 1) / (rates[base] || 1);
}

function parseAmount(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value || "")
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return Number(cleaned) || 0;
}

function formatInputAmount(value) {
  return String(value ?? "").replace(".", ",");
}

function currencyOptions(selected) {
  return Object.keys(state.settings.rates)
    .map((currency) => `<option value="${currency}" ${selected === currency ? "selected" : ""}>${currency}</option>`)
    .join("");
}

function paymentMethodOptions(model) {
  const selected = model.paymentMethod || (model.cardId ? "credit" : "pix");
  const options = [
    ["cash", "À vista / dinheiro"],
    ["pix", "Pix"],
    ["debit", "Débito"],
    ["account", "Conta"],
    ["credit", "Crédito / cartão"]
  ];
  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes(";") ? ";" : ",";
      return line.split(separator).map((cell) => cell.replace(/^"|"$/g, "").trim());
    });
}

function objectFromRow(headers, row) {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index] || "";
    return acc;
  }, {});
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return today();
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toast(message) {
  const root = $("#toastRoot");
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  root.append(element);
  setTimeout(() => {
    element.remove();
  }, 3600);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Força ativação da nova versão assim que instalada.
        if (registration.waiting) registration.waiting.postMessage("SKIP_WAITING");
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
