const STORAGE_KEY = "precis-finance-state-v1";
const SECURE_KEY = "precis-finance-secure-v1";
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
  automation: { title: "Automações", render: renderAutomation },
  security: { title: "Segurança", render: renderSecurity }
};

const categoryColors = ["#176b5b", "#f27d72", "#4267b2", "#f0b84e", "#7d5ab6", "#26966f", "#c35f4d", "#5c7485"];

let state = null;
let encryptedMode = false;
let sessionPin = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  bindShellEvents();
  registerServiceWorker();

  if (localStorage.getItem(SECURE_KEY)) {
    encryptedMode = true;
    showLockScreen();
    return;
  }

  state = loadPlainState();
  afterStateLoaded();
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
    if (!state) return;
    if (encryptedMode) {
      lockApp();
    } else {
      location.hash = "#/security";
    }
  });

  $("#unlockForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await unlockWithPin($("#unlockPin").value);
  });

  $("#resetEncryptedData").addEventListener("click", () => {
    if (!confirm("Apagar os dados protegidos deste navegador?")) return;
    localStorage.removeItem(SECURE_KEY);
    sessionPin = null;
    encryptedMode = false;
    state = createSeedState();
    persist();
    $("#lockScreen").hidden = true;
    afterStateLoaded();
    toast("Dados protegidos apagados. Um novo painel foi criado.");
  });

  window.addEventListener("hashchange", () => {
    if (state) render();
  });
}

function afterStateLoaded() {
  if (!location.hash) location.hash = "#/dashboard";
  hydratePeriodSelect();
  render();
}

function loadPlainState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const seed = createSeedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return createSeedState();
  }
}

function normalizeState(value) {
  const seed = createSeedState();
  return {
    ...seed,
    ...value,
    settings: { ...seed.settings, ...(value.settings || {}) },
    accounts: value.accounts || seed.accounts,
    cards: value.cards || seed.cards,
    categories: value.categories || seed.categories,
    transactions: value.transactions || seed.transactions,
    budgets: value.budgets || seed.budgets,
    goals: value.goals || seed.goals,
    rules: value.rules || seed.rules,
    connections: value.connections || seed.connections
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
      { id: "card_black", name: "Black final 1020", brand: "Mastercard", limit: 9800, closingDay: 18, dueDay: 26, color: "#13201c" },
      { id: "card_gold", name: "Gold final 4411", brand: "Visa", limit: 5200, closingDay: 8, dueDay: 16, color: "#b8892e" }
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
    ],
    connections: [
      { id: "conn_nu", name: "Nubank", kind: "Open Finance", status: "demo", lastSync: "" },
      { id: "conn_itau", name: "Itaú", kind: "Open Finance", status: "disconnected", lastSync: "" },
      { id: "conn_inter", name: "Banco Inter", kind: "Open Finance", status: "disconnected", lastSync: "" }
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
  const base = state.settings.baseCurrency;
  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addAccount">＋ Nova conta</button>
      <label class="secondary-action" for="statementInput">Importar extrato CSV</label>
      <input id="statementInput" type="file" accept=".csv,text/csv" hidden />
      <button class="secondary-action" type="button" id="editRates">Moedas</button>
    </section>

    <section class="card-grid">
      ${state.accounts.map(accountCard).join("")}
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Conexões bancárias</h2>
          <p>Conectores em modo demonstrativo para planejar a integração real.</p>
        </div>
        <span class="pill neutral">Base ${base}</span>
      </div>
      <div class="card-grid">
        ${state.connections
          .map((connection) => `
            <article class="item-card">
              <div class="item-title">
                <div>
                  <strong>${escapeHtml(connection.name)}</strong>
                  <p class="muted">${escapeHtml(connection.kind)}</p>
                </div>
                <span class="pill ${connection.status === "disconnected" ? "neutral" : ""}">${connection.status === "disconnected" ? "desconectado" : "demo"}</span>
              </div>
              <small class="muted">Última sincronização: ${connection.lastSync ? escapeHtml(connection.lastSync) : "nunca"}</small>
              <div class="inline-group">
                <button class="secondary-action" type="button" data-action="connect-demo" data-id="${connection.id}">Conectar demo</button>
                <button class="ghost-action" type="button" data-action="sync-demo" data-id="${connection.id}">Sincronizar</button>
              </div>
            </article>
          `)
          .join("")}
      </div>
    </section>
  `;

  $("#addAccount", container).addEventListener("click", () => openAccountModal());
  $("#editRates", container).addEventListener("click", openRatesModal);
  $("#statementInput", container).addEventListener("change", (event) => importStatement(event.target.files[0]));

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-account") openAccountModal(button.dataset.id);
    if (button.dataset.action === "delete-account") deleteAccount(button.dataset.id);
    if (button.dataset.action === "connect-demo") connectDemo(button.dataset.id);
    if (button.dataset.action === "sync-demo") syncDemo(button.dataset.id);
  });
}

function renderCards(container) {
  const month = state.settings.selectedMonth;
  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="addCard">＋ Novo cartão</button>
    </section>
    <section class="card-grid">
      ${state.cards
        .map((card) => {
          const spent = cardSpent(card.id, month);
          const outstanding = cardOutstanding(card.id, month);
          const percent = Math.min(100, (spent / card.limit) * 100);
          return `
            <article class="item-card">
              <div class="item-title">
                <div>
                  <span class="inline-group"><span class="swatch" style="background:${card.color}"></span><strong>${escapeHtml(card.name)}</strong></span>
                  <p class="muted">${escapeHtml(card.brand)} · fecha dia ${card.closingDay} · vence dia ${card.dueDay}</p>
                </div>
                <span class="pill ${percent >= 80 ? "danger" : percent >= 50 ? "warn" : ""}">${Math.round(percent)}%</span>
              </div>
              <div>
                <strong>${money(outstanding)}</strong>
                <p class="muted">Fatura aberta · ${money(spent)} em compras · ${money(Math.max(0, card.limit - spent))} livres</p>
              </div>
              <div class="progress ${percent >= 80 ? "danger" : percent >= 50 ? "warn" : ""}" style="--value:${percent}%"><span></span></div>
              <div class="inline-group">
                <button class="secondary-action" type="button" data-action="edit-card" data-id="${card.id}">Editar</button>
                <button class="ghost-action" type="button" data-action="pay-card" data-id="${card.id}" ${outstanding <= 0 ? "disabled" : ""}>Pagar fatura</button>
                <button class="danger-action" type="button" data-action="delete-card" data-id="${card.id}">Excluir</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;

  $("#addCard", container).addEventListener("click", () => openCardModal());
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit-card") openCardModal(button.dataset.id);
    if (button.dataset.action === "delete-card") deleteCard(button.dataset.id);
    if (button.dataset.action === "pay-card") payCardInvoice(button.dataset.id);
  });
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
            <h2>Notificações e SMS</h2>
            <p>Cole alertas bancários para transformar em lançamentos.</p>
          </div>
        </div>
        <label class="field">
          Alertas recebidos
          <textarea id="notificationText" placeholder="Compra aprovada R$ 45,90 Supermercado&#10;PIX recebido R$ 120,00 Cliente"></textarea>
        </label>
        <div class="inline-group" style="margin-top:12px">
          <button class="primary-action" type="button" id="parseNotifications">Importar alertas</button>
          <button class="secondary-action" type="button" id="addRule">Nova regra</button>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Regras inteligentes</h2>
          <p>Palavras-chave usadas para sugerir categoria e subcategoria.</p>
        </div>
      </div>
      <div class="card-grid">
        ${state.rules.map(ruleCard).join("")}
      </div>
    </section>
  `;

  $("#processRecurring", container).addEventListener("click", processRecurringForMonth);
  $("#parseNotifications", container).addEventListener("click", () => importNotifications($("#notificationText", container).value));
  $("#addRule", container).addEventListener("click", () => openRuleModal());
  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-rule") deleteRule(button.dataset.id);
  });
}

function renderSecurity(container) {
  container.innerHTML = `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Bloqueio local</h2>
            <p>${encryptedMode ? "Os dados deste navegador estão protegidos por PIN." : "Ative um PIN para criptografar os dados salvos neste navegador."}</p>
          </div>
          <span class="pill ${encryptedMode ? "" : "neutral"}">${encryptedMode ? "ativo" : "inativo"}</span>
        </div>
        ${
          encryptedMode
            ? `
              <div class="inline-group">
                <button class="primary-action" type="button" id="lockNow">Bloquear agora</button>
                <button class="danger-action" type="button" id="disablePin">Desativar PIN</button>
              </div>
            `
            : `
              <form id="pinForm" class="form-grid">
                <label class="field">
                  Novo PIN
                  <input name="pin" type="password" inputmode="numeric" minlength="4" required />
                </label>
                <label class="field">
                  Confirmar PIN
                  <input name="confirmPin" type="password" inputmode="numeric" minlength="4" required />
                </label>
                <div class="field full">
                  <button class="primary-action" type="submit">Ativar proteção</button>
                </div>
              </form>
            `
        }
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h2>Backups</h2>
            <p>Exporte ou restaure os dados deste navegador.</p>
          </div>
        </div>
        <div class="inline-group">
          <button class="secondary-action" type="button" id="exportBackup">Exportar JSON</button>
          <label class="secondary-action" for="backupInput">Importar JSON</label>
          <input id="backupInput" type="file" accept="application/json,.json" hidden />
          <button class="danger-action" type="button" id="resetDemo">Resetar demo</button>
        </div>
      </article>
    </section>

    <section class="notice-band">
      A versão web estática guarda os dados no navegador atual. Sincronização real em nuvem, Open Finance produtivo e leitura automática de SMS exigem backend e integrações externas.
    </section>
  `;

  if (encryptedMode) {
    $("#lockNow", container).addEventListener("click", lockApp);
    $("#disablePin", container).addEventListener("click", disablePin);
  } else {
    $("#pinForm", container).addEventListener("submit", enablePin);
  }

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
  const payment = transaction.cardId ? findCard(transaction.cardId)?.name : findAccount(transaction.accountId)?.name;
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
    categoryId: state.categories.find((category) => category.type === "expense")?.id || "",
    subcategory: "",
    tags: "",
    location: "",
    note: "",
    recurring: false,
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
        Moeda
        <select name="currency">
          ${currencyOptions(model.currency)}
        </select>
      </label>
      <label class="field">
        Conta
        <select name="accountId">
          <option value="">Sem conta</option>
          ${state.accounts.map((account) => `<option value="${account.id}" ${model.accountId === account.id ? "selected" : ""}>${escapeHtml(account.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field">
        Cartão
        <select name="cardId">
          <option value="">Sem cartão</option>
          ${state.cards.map((card) => `<option value="${card.id}" ${model.cardId === card.id ? "selected" : ""}>${escapeHtml(card.name)}</option>`).join("")}
        </select>
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
    </form>
  `, async (form) => {
    const data = Object.fromEntries(new FormData(form).entries());
    const file = form.elements.attachment.files[0];
    const next = {
      ...model,
      id: existing?.id || uid("tx"),
      type: data.type,
      date: data.date,
      description: data.description.trim(),
      amount: parseAmount(data.amount),
      currency: data.currency,
      accountId: data.accountId,
      cardId: data.cardId,
      categoryId: data.categoryId,
      subcategory: data.subcategory,
      tags: data.tags,
      location: data.location,
      note: data.note,
      recurring: data.recurring === "on",
      attachmentName: file?.name || model.attachmentName || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!next.amount || next.amount <= 0) {
      toast("Informe um valor maior que zero.");
      return false;
    }

    upsertTransaction(next, existing);
    return true;
  });

  const typeSelect = $("#txType", $("#modalRoot"));
  const categorySelect = $("#txCategory", $("#modalRoot"));
  const subcategorySelect = $("#txSubcategory", $("#modalRoot"));
  const descriptionInput = $("#txDescription", $("#modalRoot"));

  const refreshCategories = () => {
    const available = state.categories.filter((category) => category.type === typeSelect.value || typeSelect.value === "transfer");
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

  typeSelect.addEventListener("change", refreshCategories);
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
  const model = existing || { name: "", brand: "Visa", limit: 3000, closingDay: 10, dueDay: 18, color: "#13201c" };

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
        Fechamento
        <input name="closingDay" type="number" min="1" max="31" value="${model.closingDay}" required />
      </label>
      <label class="field">
        Vencimento
        <input name="dueDay" type="number" min="1" max="31" value="${model.dueDay}" required />
      </label>
      <label class="field">
        Cor
        <input name="color" type="color" value="${model.color}" />
      </label>
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
      color: data.color
    };
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
  if (existing) {
    applyTransactionImpact(existing, -1);
    state.transactions = state.transactions.map((transaction) => (transaction.id === existing.id ? next : transaction));
  } else {
    state.transactions.unshift(next);
  }
  applyTransactionImpact(next, 1);
  state.settings.selectedMonth = next.date.slice(0, 7);
  persistAndRender(existing ? "Lançamento atualizado." : "Lançamento criado.");
}

function deleteTransaction(id) {
  const transaction = findTransaction(id);
  if (!transaction || !confirm("Excluir este lançamento?")) return;
  applyTransactionImpact(transaction, -1);
  state.transactions = state.transactions.filter((item) => item.id !== id);
  persistAndRender("Lançamento excluído.");
}

function applyTransactionImpact(transaction, direction) {
  const account = findAccount(transaction.accountId);
  if (!account) return;
  if (transaction.type === "income") account.balance += transaction.amount * direction;
  if (transaction.type === "expense" && !transaction.cardId) account.balance -= transaction.amount * direction;
  if (transaction.type === "transfer") account.balance -= transaction.amount * direction;
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

function payCardInvoice(cardId) {
  const card = findCard(cardId);
  const account = state.accounts.find((item) => item.currency === state.settings.baseCurrency) || state.accounts[0];
  const amount = cardOutstanding(cardId, state.settings.selectedMonth);
  if (!card || !account || amount <= 0) return;

  const payment = {
    id: uid("tx"),
    type: "transfer",
    date: today(),
    description: `Pagamento fatura ${card.name}`,
    amount,
    currency: state.settings.baseCurrency,
    accountId: account.id,
    cardId: card.id,
    categoryId: "",
    subcategory: "",
    tags: "cartao",
    location: "",
    note: "Baixa de fatura sem duplicar despesa no relatório.",
    recurring: false,
    attachmentName: "",
    createdAt: new Date().toISOString()
  };
  state.transactions.unshift(payment);
  applyTransactionImpact(payment, 1);
  persistAndRender("Pagamento de fatura registrado.");
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
  state.rules = state.rules.filter((rule) => rule.id !== id);
  persistAndRender("Regra excluída.");
}

function connectDemo(id) {
  const connection = state.connections.find((item) => item.id === id);
  if (!connection) return;
  connection.status = "demo";
  connection.lastSync = new Date().toLocaleString("pt-BR");
  persistAndRender("Conector demo ativado.");
}

function syncDemo(id) {
  const connection = state.connections.find((item) => item.id === id);
  if (!connection) return;
  connection.status = "demo";
  connection.lastSync = new Date().toLocaleString("pt-BR");
  persistAndRender("Sincronização demonstrativa concluída.");
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

function importNotifications(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let imported = 0;
  lines.forEach((line) => {
    const parsed = parseNotification(line);
    if (!parsed) return;
    state.transactions.unshift(parsed);
    applyTransactionImpact(parsed, 1);
    imported += 1;
  });

  persistAndRender(imported ? `${imported} alerta(s) importado(s).` : "Nenhum alerta reconhecido.");
}

function parseNotification(line) {
  const amountMatch = line.match(/(?:R\$|BRL)\s*([\d.]+,\d{2}|[\d,]+(?:\.\d{2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const lower = line.toLowerCase();
  const type = /recebid|credito|crédito|deposit|pix recebido/.test(lower) ? "income" : "expense";
  const suggestion = suggestCategory(line, type);
  const account = state.accounts.find((item) => item.currency === "BRL") || state.accounts[0];

  return {
    id: uid("tx"),
    type,
    date: today(),
    description: cleanNotificationDescription(line),
    amount,
    currency: "BRL",
    accountId: account?.id || "",
    cardId: "",
    categoryId: suggestion?.categoryId || state.categories.find((category) => category.type === type)?.id || "",
    subcategory: suggestion?.subcategory || "",
    tags: "importado",
    location: "",
    note: line,
    recurring: false,
    attachmentName: "",
    createdAt: new Date().toISOString()
  };
}

function cleanNotificationDescription(line) {
  return line
    .replace(/(?:compra aprovada|compra|pix recebido|pagamento recebido|r\$|brl)/gi, "")
    .replace(/[\d.,]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Importado por alerta";
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

  return state.transactions
    .filter((transaction) => {
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
  if (!confirm("Resetar todos os dados deste navegador?")) return;
  state = createSeedState();
  sessionPin = null;
  encryptedMode = false;
  localStorage.removeItem(SECURE_KEY);
  persistAndRender("Demo restaurada.");
}

async function enablePin(event) {
  event.preventDefault();
  if (!crypto?.subtle) {
    toast("Ative o PIN usando HTTPS ou localhost para liberar a criptografia do navegador.");
    return;
  }
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (data.pin !== data.confirmPin) {
    toast("Os PINs não conferem.");
    return;
  }
  sessionPin = data.pin;
  encryptedMode = true;
  localStorage.removeItem(STORAGE_KEY);
  await persist();
  render();
  toast("Proteção ativada.");
}

async function disablePin() {
  const pin = prompt("Digite o PIN atual para desativar.");
  if (!pin) return;
  try {
    await decryptState(pin);
    encryptedMode = false;
    sessionPin = null;
    localStorage.removeItem(SECURE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
    toast("PIN desativado.");
  } catch {
    toast("PIN incorreto.");
  }
}

function lockApp() {
  if (!encryptedMode) return;
  sessionPin = null;
  state = null;
  $("#unlockPin").value = "";
  showLockScreen();
}

function showLockScreen() {
  $("#lockScreen").hidden = false;
  $("#unlockPin").focus();
}

async function unlockWithPin(pin) {
  try {
    state = await decryptState(pin);
    sessionPin = pin;
    $("#lockScreen").hidden = true;
    afterStateLoaded();
    toast("Painel desbloqueado.");
  } catch {
    toast("PIN incorreto ou dados corrompidos.");
  }
}

async function decryptState(pin) {
  const envelope = JSON.parse(localStorage.getItem(SECURE_KEY));
  const key = await deriveKey(pin, fromBase64(envelope.salt), envelope.iterations);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data));
  return normalizeState(JSON.parse(new TextDecoder().decode(decrypted)));
}

async function persist() {
  if (encryptedMode) {
    if (!sessionPin) return;
    const envelope = await encryptState(JSON.stringify(state), sessionPin);
    localStorage.setItem(SECURE_KEY, JSON.stringify(envelope));
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function persistAndRender(message) {
  await persist();
  hydratePeriodSelect();
  render();
  if (message) toast(message);
}

async function encryptState(plainText, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 160000;
  const key = await deriveKey(pin, salt, iterations);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));
  return {
    version: 1,
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted))
  };
}

async function deriveKey(pin, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function monthlyTotals(month) {
  return getMonthTransactions(month).reduce(
    (acc, transaction) => {
      const value = convertToBase(transaction.amount, transaction.currency);
      if (transaction.type === "income") acc.income += value;
      if (transaction.type === "expense") acc.expense += value;
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
  const sign = transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : "";
  return `${sign}${money(transaction.amount, transaction.currency)}`;
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

function toBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
