import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useFinance } from "@/context/FinanceContext";
import {
  getPluggyAccounts,
  getPluggyBills,
  getPluggyCards,
  getPluggyItems,
  getPluggyTransactions,
  openPluggyConnect,
  syncAll,
  syncItem,
  disconnectAllOpenFinance,
  deletePluggyItem,
} from "../pluggy.js";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";

type PluggyItem = { item_id: string; connector_name?: string; status?: string };
type PluggyAccount = { account_id: string; name?: string; balance?: number; type?: string };
type PluggyTx = { tx_id: string; date?: string; description?: string; amount?: number };

export function OpenFinancePage() {
  const { user, configured } = useAuth();
  const { syncDatabase } = useFinance();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const enabled = configured && !!user;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["open-finance"],
    enabled,
    queryFn: async () => {
      const [items, accounts, cards, txs, bills] = await Promise.all([
        getPluggyItems(supabase),
        getPluggyAccounts(supabase),
        getPluggyCards(supabase),
        getPluggyTransactions(supabase, { limit: 50 }),
        getPluggyBills(supabase),
      ]);
      return { items, accounts, cards, txs, bills };
    },
  });

  async function connect() {
    if (!user) { toast("Faça login primeiro."); return; }
    setBusy(true);
    try {
      await openPluggyConnect(supabase, {
        onSuccess: async () => {
          toast("Conectado!");
          await syncDatabase();
          await refetch();
        },
        onError: (e: unknown) => toast(String((e as Error)?.message || e)),
      });
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function syncEverything() {
    setBusy(true);
    try {
      const r = await syncAll(supabase);
      toast(`Sincronizado: ${r.items}/${r.total} itens`);
      await syncDatabase();
      await refetch();
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!user) return;
    if (!window.confirm("Deseja realmente desconectar e excluir esta conexão bancária? Todas as contas, faturas, investimentos e transações importadas por ela serão removidas do sistema.")) return;
    setBusy(true);
    try {
      await deletePluggyItem(supabase, itemId, user.id);
      toast("Conexão bancária excluída com sucesso!");
      await syncDatabase();
      await refetch();
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    } catch (e) {
      toast("Erro ao excluir conexão: " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnectAll() {
    if (!user) return;
    if (!window.confirm("Tem certeza que deseja desconectar todas as contas e limpar as informações do Open Finance? Isso apagará todas as transações, saldos e cartões importados.")) return;
    setBusy(true);
    try {
      await disconnectAllOpenFinance(supabase, user.id);
      toast("Dados do Open Finance limpos com sucesso!");
      await syncDatabase();
      await refetch();
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    } catch (e) {
      toast("Erro ao limpar dados: " + String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!configured || !user) {
    return (
      <section className="panel">
        <h2>Open Finance</h2>
        <p className="muted">Faça login e configure o Supabase para conectar bancos via Pluggy.</p>
        <Link to="/login">Ir para login</Link>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>Open Finance</h2>
        <p className="muted">Conecte bancos pelo Pluggy. Os dados passam pelo motor de tratamento antes de aparecer nas telas de correção e cartões OF.</p>
      </section>
      <section className="actions-row">
        <button type="button" className="primary-action" disabled={busy} onClick={connect}>➕ Conectar Banco</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={syncEverything}>🔄 Sincronizar Tudo</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={handleDisconnectAll} style={{ color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.05)" }}>
          🗑️ Limpar Open Finance
        </button>
        <Link to="/correcao/open-finance" className="secondary-action">🛠️ Correção OF</Link>
        <Link to="/cartoes" className="secondary-action">💳 Cartões</Link>
        <Link to="/extrato" className="secondary-action">📋 Extrato Unificado</Link>
      </section>

      {isLoading ? <p>Carregando…</p> : (
        <>
          <section className="panel" style={{ marginTop: 16 }}>
            <h3>Conexões ({data?.items.length ?? 0})</h3>
            <ul className="stack-list">
              {(data?.items as PluggyItem[] ?? []).map((it) => (
                <li key={it.item_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <strong>{it.connector_name || it.item_id}</strong>
                    <span className="muted" style={{ fontSize: "0.8rem" }}>ID: {it.item_id}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span className="pill" style={{ marginRight: 8 }}>{it.status}</span>
                    <button
                      type="button"
                      className="ghost-action"
                      disabled={busy}
                      onClick={() =>
                        syncItem(supabase, it.item_id)
                          .then(() => syncDatabase())
                          .then(() => refetch())
                          .then(() => toast("Sincronizado com sucesso!"))
                          .catch((e) => toast("Erro: " + String(e.message || e)))
                      }
                    >
                      🔄 Sincronizar
                    </button>
                    <button
                      type="button"
                      className="ghost-action"
                      style={{ color: "var(--red)" }}
                      disabled={busy}
                      onClick={() => handleDeleteItem(it.item_id)}
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="two-col" style={{ marginTop: 16 }}>
            <article className="panel">
              <h3>Contas ({(data?.accounts as PluggyAccount[] ?? []).filter((a) => a.type !== "CREDIT").length})</h3>
              {(data?.accounts as PluggyAccount[] ?? []).filter((a) => a.type !== "CREDIT").map((a) => (
                <p key={a.account_id}>{a.name}: {money(Number(a.balance ?? 0))}</p>
              ))}
            </article>
            <article className="panel">
              <h3>Transações recentes</h3>
              {(data?.txs as PluggyTx[] ?? []).slice(0, 10).map((t) => (
                <p key={t.tx_id}>{fmtDate(t.date)} · {t.description} · {money(Math.abs(Number(t.amount ?? 0)))}</p>
              ))}
            </article>
          </section>
        </>
      )}
    </>
  );
}
