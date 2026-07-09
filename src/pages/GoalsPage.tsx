import { FormEvent } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, uid } from "@/lib/format";

export function GoalsPage() {
  const { state, update } = useFinance();
  if (!state) return null;

  function addGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => {
      s.goals.push({
        id: uid("goal"),
        name: String(fd.get("name")),
        target: Number(fd.get("target")),
        saved: Number(fd.get("saved") || 0),
        deadline: String(fd.get("deadline")),
        currency: "BRL",
        color: "#176b5b",
      });
    });
    e.currentTarget.reset();
  }

  function contribute(id: string) {
    const v = prompt("Quanto deseja adicionar?");
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return;
    update((s) => {
      const g = s.goals.find((x) => x.id === id);
      if (g) g.saved = Math.min(g.target, g.saved + n);
    });
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <form onSubmit={addGoal} className="form-grid">
          <label>Nome<input name="name" required /></label>
          <label>Meta<input name="target" type="number" required /></label>
          <label>Já guardado<input name="saved" type="number" defaultValue={0} /></label>
          <label>Prazo<input name="deadline" type="date" required /></label>
          <button type="submit" className="primary-action">Criar meta</button>
        </form>
      </section>
      <section className="card-grid">
        {state.goals.map((g) => {
          const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
          return (
            <article key={g.id} className="panel">
              <h3>{g.name}</h3>
              <p>{money(g.saved)} de {money(g.target)}</p>
              <div className="progress" style={{ ["--value" as string]: `${pct}%` }}><span /></div>
              <button type="button" className="secondary-action" onClick={() => contribute(g.id)}>Contribuir</button>
            </article>
          );
        })}
      </section>
    </>
  );
}
