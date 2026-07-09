import { FormEvent } from "react";
import { useFinance } from "@/context/FinanceContext";
import { cardOutstanding, cardSpent } from "@/domain/finance";
import { money, uid } from "@/lib/format";
import { Link } from "react-router-dom";

export function CardsManualPage() {
  const { state, update } = useFinance();
  if (!state) return null;
  const month = state.settings.selectedMonth;

  function addCard(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => {
      s.cards.push({
        id: uid("card"),
        name: String(fd.get("name")),
        brand: String(fd.get("brand") || "Visa"),
        limit: Number(fd.get("limit")),
        closingDay: Number(fd.get("closingDay")),
        dueDay: Number(fd.get("dueDay")),
        color: "#13201c",
        accountId: String(fd.get("accountId") || ""),
        autoPay: false,
      });
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 16 }}>
        Cartões do seu controle manual. Para cartões do Open Finance com motor de tratamento, veja{" "}
        <Link to="/cartoes-of">Cartões OF</Link> ou <Link to="/correcao/open-finance">Correção OF</Link>.
      </p>
      <section className="panel" style={{ marginBottom: 16 }}>
        <form onSubmit={addCard} className="form-grid">
          <label>Nome<input name="name" required /></label>
          <label>Limite<input name="limit" type="number" required /></label>
          <label>Fechamento<input name="closingDay" type="number" min={1} max={31} required /></label>
          <label>Vencimento<input name="dueDay" type="number" min={1} max={31} required /></label>
          <label>Conta débito<select name="accountId"><option value="">—</option>{state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <button type="submit" className="primary-action">Adicionar cartão</button>
        </form>
      </section>
      <section className="card-grid">
        {state.cards.map((c) => (
          <article key={c.id} className="panel">
            <h3>{c.name}</h3>
            <p>Fatura: {money(cardOutstanding(state, c.id, month))}</p>
            <p className="muted">Gastos: {money(cardSpent(state, c.id, month))} / {money(c.limit)}</p>
          </article>
        ))}
      </section>
    </>
  );
}
