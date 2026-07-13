import { FormEvent, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { useSearchParams } from "react-router-dom";
import { getMonthTransactions, suggestCategory } from "@/domain/finance";
import { fmtDate, money } from "@/lib/format";
import type { TxType } from "@/domain/types";

export function TransactionsPage() {
  const { state, addTransaction, deleteTransaction } = useFinance();
  const [params] = useSearchParams();
  const [showForm, setShowForm] = useState(params.get("novo") === "1");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!state) return [];
    const month = state.settings.selectedMonth;
    return getMonthTransactions(state, month).filter((t) => {
      if (!q) return true;
      const hay = `${t.description} ${t.tags} ${t.note}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [state, q]);

  if (!state) return null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as TxType;
    const description = String(fd.get("description") || "");
    const amount = Number(fd.get("amount"));
    const date = String(fd.get("date"));
    const accountId = String(fd.get("accountId") || "");
    const cardId = String(fd.get("cardId") || "");
    const s = state!;
    const cat = suggestCategory(s, description, type === "income" ? "income" : "expense");
    addTransaction({
      type,
      date,
      description,
      amount,
      currency: s.settings.baseCurrency,
      accountId: type === "expense" && cardId ? "" : accountId,
      cardId: type === "expense" ? cardId : "",
      categoryId: cat?.categoryId || "",
      subcategory: cat?.subcategory || "",
      tags: "",
      location: "",
      note: "",
      recurring: false,
    });
    setShowForm(false);
    e.currentTarget.reset();
  }

  return (
    <>
      <section className="actions-row">
        <button type="button" className="primary-action" onClick={() => setShowForm((v) => !v)}>+ Novo lançamento</button>
        <input type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </section>

      {showForm && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <form onSubmit={onSubmit} className="form-grid">
            <label>Tipo<select name="type" defaultValue="expense"><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência</option></select></label>
            <label>Data<input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
            <label>Descrição<input name="description" required /></label>
            <label>Valor<input name="amount" type="number" step="0.01" min="0.01" required /></label>
            <label>Conta<select name="accountId"><option value="">—</option>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Cartão<select name="cardId"><option value="">—</option>{state.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button type="submit" className="primary-action">Salvar</button>
          </form>
        </section>
      )}

      <section className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th /></tr></thead>
          <tbody>
            {rows.map((t) => {
              const cat = state.categories.find((c) => c.id === t.categoryId);
              const isPluggy = t.source === "pluggy";
              return (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td>{t.description}{isPluggy && <span className="pill" style={{ marginLeft: 8 }}>OF</span>}</td>
                  <td>{cat?.name || "—"}</td>
                  <td>{money(t.amount)}</td>
                  <td>{!isPluggy && <button type="button" className="ghost-action" onClick={() => deleteTransaction(t.id)}>Excluir</button>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="muted">Nenhum lançamento.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
