import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CardService } from "@/services/CardService";
import { FieldValue } from "@/components/ui/FieldValue";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CardsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["cards"], queryFn: CardService.listResolved });

  if (isLoading) return <p>Carregando cartões…</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>Erro: {(error as Error).message}</p>;
  if (!data?.length) return <p>Nenhum cartão sincronizado ainda.</p>;

  return (
    <>
      <h2>Cartões</h2>
      <div className="grid">
        {data.map((c) => (
          <Link key={c.cardId} to={`/cartoes-of/${c.cardId}`} className="card" style={{ textDecoration: "none" }}>
            <h3 style={{ marginTop: 0 }}>{c.displayName.value ?? "Cartão"}</h3>
            <div className="row"><span>Limite total</span><FieldValue field={c.creditLimit} format={brl} /></div>
            <div className="row"><span>Disponível</span><FieldValue field={c.availableLimit} format={brl} /></div>
            <div className="row"><span>Utilizado</span><FieldValue field={c.usedLimit} format={brl} /></div>
            <div className="row"><span>Fatura atual</span><FieldValue field={c.currentBillAmount} format={brl} /></div>
            <div className="row"><span>Vencimento</span><FieldValue field={c.dueDay} format={(d) => `dia ${d}`} /></div>
          </Link>
        ))}
      </div>
    </>
  );
}
