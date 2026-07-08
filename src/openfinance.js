// Tela "Open Finance" para o PrecisFinance.
// Reaproveita as classes de CSS já existentes (actions-row, primary-action,
// card-grid, item-card, muted, pill, etc.) para parecer nativo do app.
//
// Integração no app.js:
//   import { renderOpenFinance, setOpenFinanceContext } from "./openfinance.js";
//   // depois de criar o supabaseClient:
//   setOpenFinanceContext({ supabaseClient });
//   // no objeto routes:
//   openfinance: { title: "Open Finance", render: renderOpenFinance }

import {
  connectBank,
  syncAll,
  syncItem,
  disconnectItem,
  getPluggyItems,
  getPluggyAccounts,
  getPluggyCards,
  getPluggyTransactions,
  getPluggyInvestments,
} from "./pluggy.js";

let _supabase = null;
let _toast = (msg) => console.log("[openfinance]", msg);

export function setOpenFinanceContext({ supabaseClient, showToast } = {}) {
  if (supabaseClient) _supabase = supabaseClient;
  if (typeof showToast === "function") _toast = showToast;
}

// ---------------- helpers de formatação (independentes do app) --------------
function brl(value, currency = "BRL") {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
  } catch {
    return n.toFixed(2);
  }
}
function fmtDate(d) {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(d + "T00:00:00"));
  } catch {
    return String(d);
  }
}
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function statusPill(status) {
  const s = String(status || "").toUpperCase();
  if (s === "UPDATED") return `<span class="pill">Atualizado</span>`;
  if (s === "UPDATING") return `<span class="pill warn">Atualizando…</span>`;
  if (s === "LOGIN_ERROR" || s === "ERROR") return `<span class="pill danger">Erro — reconectar</span>`;
  if (s === "WAITING_USER_INPUT") return `<span class="pill warn">Aguardando você</span>`;
  return `<span class="pill">${esc(status || "—")}</span>`;
}

// ---------------- render principal ------------------------------------------
export function renderOpenFinance(container) {
  if (!_supabase) {
    container.innerHTML = `<section class="panel"><p class="muted">Login em nuvem não iniciado.</p></section>`;
    return;
  }

  container.innerHTML = `
    <section class="actions-row">
      <button class="primary-action" type="button" id="ofConnect">+ Conectar banco (Open Finance)</button>
      <button class="secondary-action" type="button" id="ofSyncAll">↻ Sincronizar tudo</button>
    </section>
    <div id="ofBody">
      <section class="panel"><p class="muted">Carregando dados do Open Finance…</p></section>
    </div>
  `;

  const body = container.querySelector("#ofBody");

  container.querySelector("#ofConnect").addEventListener("click", async () => {
    try {
      _toast("Abrindo conexão segura…");
      await connectBank(_supabase, {
        onSuccess: async () => {
          _toast("Banco conectado! Sincronizando…");
          await loadBody(body);
        },
      });
    } catch (e) {
      console.error(e);
      _toast("Não foi possível conectar: " + (e?.message || e));
    }
  });

  container.querySelector("#ofSyncAll").addEventListener("click", async () => {
    try {
      _toast("Sincronizando conexões…");
      const n = await syncAll(_supabase);
      _toast(n ? "Sincronização concluída." : "Nenhum banco conectado ainda.");
      await loadBody(body);
    } catch (e) {
      console.error(e);
      _toast("Erro ao sincronizar: " + (e?.message || e));
    }
  });

  // Delegação de eventos para botões gerados dinamicamente.
  body.addEventListener("click", async (event) => {
    const btn = event.target.closest("button[data-of-action]");
    if (!btn) return;
    const { ofAction, id } = btn.dataset;
    try {
      if (ofAction === "sync-item") {
        _toast("Atualizando conexão…");
        await syncItem(_supabase, id);
        _toast("Conexão atualizada.");
        await loadBody(body);
      }
      if (ofAction === "reconnect") {
        await connectBank(_supabase, { itemId: id, onSuccess: async () => loadBody(body) });
      }
      if (ofAction === "disconnect") {
        if (confirm("Desconectar este banco e apagar os dados importados?")) {
          await disconnectItem(_supabase, id);
          _toast("Banco desconectado.");
          await loadBody(body);
        }
      }
    } catch (e) {
      console.error(e);
      _toast("Erro: " + (e?.message || e));
    }
  });

  loadBody(body);
}

async function loadBody(body) {
  try {
    const [items, accounts, cards, investments, transactions] = await Promise.all([
      getPluggyItems(_supabase),
      getPluggyAccounts(_supabase),
      getPluggyCards(_supabase),
      getPluggyInvestments(_supabase),
      getPluggyTransactions(_supabase, { limit: 50 }),
    ]);

    if (!items.length) {
      body.innerHTML = `
        <section class="panel">
          <h3>Nenhum banco conectado</h3>
          <p class="muted">Clique em <strong>Conectar banco</strong> para autorizar o Open Finance
          e importar automaticamente suas contas, cartões, transações e investimentos.</p>
        </section>`;
      return;
    }

    // Contas bancárias (exclui cartões, que têm seção própria)
    const bankAccounts = accounts.filter((a) => a.type !== "CREDIT");

    body.innerHTML = `
      ${sectionConnections(items)}
      ${sectionAccounts(bankAccounts)}
      ${sectionCards(cards)}
      ${sectionInvestments(investments)}
      ${sectionTransactions(transactions)}
    `;
  } catch (e) {
    console.error(e);
    body.innerHTML = `<section class="panel"><p class="muted">Erro ao carregar: ${esc(e?.message || e)}</p></section>`;
  }
}

// ---------------- seções ----------------------------------------------------
function sectionConnections(items) {
  return `
    <h2 class="section-title">Bancos conectados</h2>
    <section class="card-grid">
      ${items.map((it) => `
        <article class="item-card">
          <div class="item-title">
            <div>
              <strong>${esc(it.connector_name || "Instituição")}</strong>
              <p class="muted">Última sync: ${it.last_synced_at ? fmtDate(it.last_synced_at.slice(0,10)) : "—"}</p>
            </div>
            ${statusPill(it.status)}
          </div>
          <div class="actions-row">
            <button class="secondary-action" type="button" data-of-action="sync-item" data-id="${esc(it.item_id)}">Atualizar</button>
            <button class="secondary-action" type="button" data-of-action="reconnect" data-id="${esc(it.item_id)}">Reconectar</button>
            <button class="secondary-action" type="button" data-of-action="disconnect" data-id="${esc(it.item_id)}">Desconectar</button>
          </div>
        </article>
      `).join("")}
    </section>`;
}

function sectionAccounts(accounts) {
  if (!accounts.length) return "";
  return `
    <h2 class="section-title">Contas & saldos</h2>
    <section class="card-grid">
      ${accounts.map((a) => `
        <article class="item-card">
          <div class="item-title">
            <div>
              <strong>${esc(a.marketing_name || a.name || "Conta")}</strong>
              <p class="muted">${esc(a.subtype || a.type || "")} ${a.number ? "· " + esc(a.number) : ""}</p>
            </div>
          </div>
          <p class="metric">${brl(a.balance, a.currency_code || "BRL")}</p>
        </article>
      `).join("")}
    </section>`;
}

function sectionCards(cards) {
  if (!cards.length) return "";
  return `
    <h2 class="section-title">Cartões de crédito</h2>
    <section class="card-grid">
      ${cards.map((c) => {
        const cd = c.credit_data || {};
        const limit = cd.creditLimit ?? cd.limit;
        const available = cd.availableCreditLimit;
        return `
        <article class="item-card">
          <div class="item-title">
            <div>
              <strong>${esc(c.marketing_name || c.name || "Cartão")}</strong>
              <p class="muted">${cd.brand ? esc(cd.brand) + " · " : ""}${cd.level ? esc(cd.level) : "cartão de crédito"}</p>
            </div>
          </div>
          <p class="muted">Fatura atual: <strong>${brl(Math.abs(c.balance ?? 0), c.currency_code || "BRL")}</strong></p>
          ${limit != null ? `<p class="muted">Limite: ${brl(limit, c.currency_code || "BRL")}${available != null ? ` · Disponível: ${brl(available, c.currency_code || "BRL")}` : ""}</p>` : ""}
          ${cd.balanceDueDate ? `<p class="muted">Vencimento: ${fmtDate(String(cd.balanceDueDate).slice(0,10))}</p>` : ""}
        </article>`;
      }).join("")}
    </section>`;
}

function sectionInvestments(investments) {
  if (!investments.length) return "";
  const total = investments.reduce((s, i) => s + Number(i.balance ?? 0), 0);
  return `
    <h2 class="section-title">Investimentos <span class="muted">(total ${brl(total)})</span></h2>
    <section class="card-grid">
      ${investments.map((i) => `
        <article class="item-card">
          <div class="item-title">
            <div>
              <strong>${esc(i.name || "Investimento")}</strong>
              <p class="muted">${esc(i.type || "")} ${i.subtype ? "· " + esc(i.subtype) : ""}</p>
            </div>
          </div>
          <p class="metric">${brl(i.balance, i.currency_code || "BRL")}</p>
        </article>
      `).join("")}
    </section>`;
}

function sectionTransactions(transactions) {
  if (!transactions.length) return "";
  return `
    <h2 class="section-title">Transações recentes</h2>
    <section class="panel">
      <div class="table-wrap">
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>
          ${transactions.map((t) => `
            <tr>
              <td>${fmtDate(t.date)}</td>
              <td>${esc(t.description || "")}</td>
              <td class="muted">${esc(t.category || "")}</td>
              <td style="text-align:right;color:${Number(t.amount) < 0 ? "var(--danger,#c35f4d)" : "inherit"}">${brl(t.amount, t.currency_code || "BRL")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      </div>
    </section>`;
}