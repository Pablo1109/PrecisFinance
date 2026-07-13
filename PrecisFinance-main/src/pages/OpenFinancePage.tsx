import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import {
  getPluggyAccounts,
  getPluggyBills,
  getPluggyCards,
  getPluggyItems,
  getPluggyTransactions,
  openPluggyConnect,
  syncAll,
  syncItem,
} from "../pluggy.js";
import { money, fmtDate } from "@/lib/format";
import { Link } from "react-router-dom";

type PluggyItem = { item_id: string; connector_name?: string; status?: string };
type PluggyAccount = { account_id: string; name?: string; balance?: number; type?: string };
type PluggyTx = { tx_id: string; date?: string; description?: string; amount?: number };

export function OpenFinancePage() {
  const { user, configured } = useAuth();
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
        onSuccess: async () => { toast("Conectado!"); await refetch(); },
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
      await refetch();
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
    } catch (e) {
      toast(String((e as Error).message));
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
        <button type="button" className="primary-action" disabled={busy} onClick={connect}>+ Conectar banco</button>
        <button type="button" className="secondary-action" disabled={busy} onClick={syncEverything}>↻ Sincronizar tudo</button>
        <Link to="/correcao/open-finance" className="secondary-action">Correção OF</Link>
        <Link to="/cartoes-of" className="secondary-action">Cartões OF</Link>
        <Link to="/extrato" className="secondary-action">Extrato unificado</Link>
      </section>

      {isLoading ? <p>Carregando…</p> : (
        <>
          <section className="panel" style={{ marginTop: 16 }}>
            <h3>Conexões ({data?.items.length ?? 0})</h3>
            <ul className="stack-list">
              {(data?.items as PluggyItem[] ?? []).map((it) => (
                <li key={it.item_id}>
                  <strong>{it.connector_name || it.item_id}</strong>
                  <span className="pill">{it.status}</span>
                  <button type="button" className="ghost-action" onClick={() => syncItem(supabase, it.item_id).then(() => refetch())}>Sync</button>
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
