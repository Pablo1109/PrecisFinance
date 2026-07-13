import { FormEvent } from "react";
import { useFinance } from "@/context/FinanceContext";
import { uid } from "@/lib/format";

export function AutomationPage() {
  const { state, update } = useFinance();
  if (!state) return null;

  function addRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    update((s) => {
      s.rules.push({
        id: uid("rule"),
        keyword: String(fd.get("keyword")).toLowerCase(),
        categoryId: String(fd.get("categoryId")),
        subcategory: String(fd.get("subcategory") || ""),
      });
    });
    e.currentTarget.reset();
  }

  return (
    <>
      <section className="panel">
        <h3>Regras de categorização</h3>
        <p className="muted">Se a descrição contiver a palavra-chave, a categoria é sugerida automaticamente.</p>
        <form onSubmit={addRule} className="form-grid" style={{ marginTop: 12 }}>
          <label>Palavra-chave<input name="keyword" required placeholder="ifood" /></label>
          <label>Categoria<select name="categoryId">{state.categories.filter((c) => c.type === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Subcategoria<input name="subcategory" /></label>
          <button type="submit" className="primary-action">Salvar regra</button>
        </form>
      </section>
      <ul className="stack-list" style={{ marginTop: 16 }}>
        {state.rules.map((r) => {
          const cat = state.categories.find((c) => c.id === r.categoryId);
          return <li key={r.id} className="panel"><strong>{r.keyword}</strong> → {cat?.name} / {r.subcategory}</li>;
        })}
      </ul>
    </>
  );
}
