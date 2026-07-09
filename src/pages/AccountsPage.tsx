import { FormEvent } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid } from "@/lib/format";

export function AccountsPage() {
  const { state, update } = useFinance();
  if (!state) return null;

  function addAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => {
      s.accounts.push({
        id: uid("acc"),
        name: String(fd.get("name")),
        type: String(fd.get("type") || "Conta corrente"),
        currency: String(fd.get("currency") || "BRL"),
        balance: Number(fd.get("balance") || 0),
        color: String(fd.get("color") || "#176b5b"),
      });
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>Nova conta</h3>
        <form onSubmit={addAccount} className="form-grid">
          <label>Nome<input name="name" required /></label>
          <label>Tipo<input name="type" defaultValue="Conta corrente" /></label>
          <label>Saldo<input name="balance" type="number" step="0.01" defaultValue={0} /></label>
          <button type="submit" className="primary-action">Adicionar</button>
        </form>
      </section>
      <section className="card-grid">
        {state.accounts.map((a) => (
          <article key={a.id} className="account-card" style={{ borderLeftColor: a.color }}>
            <h3>{a.name}</h3>
            <p className="muted">{a.type}</p>
            <strong>{money(a.balance, a.currency)}</strong>
            {a.source === "pluggy" && <span className="pill">Open Finance</span>}
          </article>
        ))}
      </section>
    </>
  );
}
