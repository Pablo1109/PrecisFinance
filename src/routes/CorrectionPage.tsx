import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CardService } from "@/services/CardService";

export function CorrectionPage() {
  const { data, isLoading } = useQuery({ queryKey: ["cards"], queryFn: CardService.listResolved });

  const incomplete = (data ?? []).filter((c) =>
    [c.creditLimit, c.currentBillAmount, c.dueDay, c.closingDay].some((f) => f.value == null || f.confidence < 50),
  );

  if (isLoading) return <p>Carregando…</p>;

  return (
    <>
      <h2>Correção Open Finance</h2>
      <p style={{ color: "var(--muted)" }}>
        Cartões com dados ausentes ou pouco confiáveis vindos do Open Finance. Corrija os campos manualmente e o Precis vai preservar suas edições nas próximas sincronizações.
      </p>
      {incomplete.length === 0 ? (
        <p>Nada para corrigir 🎉</p>
      ) : (
        <ul>
          {incomplete.map((c) => (
            <li key={c.cardId}>
              <Link to={`/cartoes/${c.cardId}`}>{c.displayName.value ?? c.cardId}</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
