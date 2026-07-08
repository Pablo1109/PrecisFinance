// Tela "Open Finance" para o PrecisFinance.
// Conexões bancárias são gerenciadas em meu.pluggy.ai — este app só lê e
// sincroniza os items visíveis pelo Pluggy Demo App (proxy do MeuPluggy).

import {
  syncAll,
  syncItem,
  listRemoteItems,
  getPluggyItems,
  getPluggyAccounts,
  getPluggyCards,
  getPluggyTransactions,
  getPluggyInvestments,
  setItemOwnerLabel,
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
  if (s === "LOGIN_ERROR" || s === "ERROR") return `<span class="pill danger">Erro — reconectar em meu.pluggy.ai</span>`;
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
    <section class="panel">
      <h3>Conexões gerenciadas no MeuPluggy</h3>
      <p class="muted">
        Para adicionar ou remover bancos, acesse
        <a href="https://meu.pluggy.ai" target="_blank" rel="noopener">meu.pluggy.ai ↗</a>.
        Depois clique em <strong>Sincronizar tudo</strong> aqui para importar os dados.
      </p>
    </section>
    <section class="actions-row">
      <button class="primary-action" type="button" id="ofSyncAll">↻ Sincronizar tudo</button>
    </section>
    <div id="ofBody">
      <section class="panel"><p class="muted">Carregando dados do Open Finance…</p></section>
    </div>
  `;

  const body = container.querySelector("#ofBody");

  container.querySelector("#ofSyncAll").addEventListener("click", async () => {
    try {
      _toast("Sincronizando conexões…");
      const res = await syncAll(_supabase);
      if (!res.total) {
        _toast("Nenhum banco visível. Conecte em meu.pluggy.ai primeiro.");
      } else if (res.errors.length) {
        _toast(`Sincronizado: ${res.items}/${res.total} (${res.errors.length} com erro).`);
      } else {
        _toast(`${res.items} item(ns) sincronizado(s).`);
      }
      await loadBody(body);
    } catch (e) {
      console.error(e);
      _toast("Erro ao sincronizar: " + (e?.message || e));
    }
  });

  // Delegação de eventos para elementos gerados dinamicamente.
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
    } catch (e) {
      console.error(e);
      _toast("Erro: " + (e?.message || e));
    }
  });

  body.addEventListener("change", async (event) => {
    const input = event.target.closest("input[data-of-owner]");
    if (!input) return;
    const itemId = input.dataset.id;
    const value = input.value.trim();
    try {
      await setItemOwnerLabel(_supabase, itemId, value);
      _toast("Dono atualizado.");
    } catch (e) {
      console.error(e);
      _toast("Erro ao salvar dono: " + (e?.message || e));
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
          <h3>Ainda nada por aqui</h3>
          <p class="muted">Conecte seus bancos em
            <a href="https://meu.pluggy.ai" target="_blank" rel="noopener">meu.pluggy.ai ↗</a>
            e depois clique em <strong>Sincronizar tudo</strong>.
          </p>
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
          <label class="muted" style="display:flex;gap:.5rem;align-items:center;margin:.5rem 0;">
            Dono:
            <input type="text" data-of-owner data-id="${esc(it.item_id)}"
                   value="${esc(it.owner_label || "")}"
                   placeholder="ex.: Eu / Namorada"
                   style="flex:1;padding:.35rem .5rem;border:1px solid var(--border,#ddd);border-radius:.4rem;background:transparent;color:inherit;" />
          </label>
          <div class="actions-row">
            <button class="secondary-action" type="button" data-of-action="sync-item" data-id="${esc(it.item_id)}">Atualizar</button>
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
              <td>${esc(t.category || "")}</td>
              <td style="text-align:right">${brl(t.amount, t.currency_code || "BRL")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      </div>
    </section>`;
}
