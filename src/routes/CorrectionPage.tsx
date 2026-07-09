import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CardService } from "@/services/CardService";
import { ReviewQueueRepository } from "@/repositories/ReviewQueueRepository";
import { EntryService } from "@/services/EntryService";
import { supabase } from "@/lib/supabase";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KIND_LABELS: Record<string, string> = {
  card_incomplete: "Cartão incompleto",
  conflict: "Conflito OF vs manual",
  reconcile_candidate: "Conciliação sugerida",
  category_learned: "Categoria aprendida",
  new_entry: "Novo lançamento",
};

export function CorrectionPage() {
  const qc = useQueryClient();
  const { data: cards, isLoading: loadingCards } = useQuery({ queryKey: ["cards"], queryFn: CardService.listResolved });
  const { data: queue, isLoading: loadingQueue } = useQuery({ queryKey: ["review-queue"], queryFn: ReviewQueueRepository.listOpen });

  const resolveReco = useMutation({
    mutationFn: async (item: { id: number; entityId: string; payload: Record<string, unknown> }) => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Não autenticado");
      const manualId = item.payload.manualEntryId as string;
      await EntryService.acceptReconciliation(uid, item.id, manualId, item.entityId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue"] }),
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => ReviewQueueRepository.resolve(id, "user"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue"] }),
  });

  const incomplete = (cards ?? []).filter((c) =>
    [c.creditLimit, c.currentBillAmount, c.dueDay, c.closingDay].some((f) => f.value == null || f.confidence < 50),
  );

  if (loadingCards || loadingQueue) return <p>Carregando…</p>;

  return (
    <>
      <h2>Correção Open Finance</h2>
      <p style={{ color: "var(--muted)" }}>
        Revise dados incompletos, conflitos e sugestões de conciliação. O motor de tratamento preserva suas correções nas sincronizações.
      </p>

      {(queue ?? []).length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h3>Fila de revisão ({queue!.length})</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {queue!.map((item) => (
              <li key={item.id} className="card" style={{ marginBottom: 12 }}>
                <strong>{KIND_LABELS[item.kind] ?? item.kind}</strong>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {item.entity} / {item.entityId}
                </div>
                {item.kind === "reconcile_candidate" && (
                  <div style={{ marginTop: 8, fontSize: 14 }}>
                    OF: {(item.payload.openfinance as { description?: string; amount?: number })?.description}{" "}
                    {brl((item.payload.openfinance as { amount?: number })?.amount ?? 0)}
                    <span style={{ marginLeft: 8, color: "var(--muted)" }}>
                      score {(item.payload.score as number) ?? 0}%
                    </span>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button className="primary" onClick={() => resolveReco.mutate(item)}>Conciliar</button>
                      <button className="ghost" onClick={() => dismiss.mutate(item.id)}>Ignorar</button>
                    </div>
                  </div>
                )}
                {item.kind === "card_incomplete" && (
                  <Link to={`/cartoes/${item.entityId}`} style={{ display: "inline-block", marginTop: 8 }}>
                    Corrigir cartão →
                  </Link>
                )}
                {item.kind === "conflict" && (
                  <div style={{ marginTop: 8 }}>
                    Campo <code>{String(item.payload.field)}</code>: OF={String(item.payload.openfinance)} vs Manual={String(item.payload.manual)}
                    {item.entity === "card" && (
                      <Link to={`/cartoes/${item.entityId}`} style={{ display: "block", marginTop: 4 }}>Revisar →</Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Cartões com dados fracos ({incomplete.length})</h3>
        {incomplete.length === 0 ? (
          <p>Nenhum cartão pendente 🎉</p>
        ) : (
          <ul>
            {incomplete.map((c) => (
              <li key={c.cardId}>
                <Link to={`/cartoes/${c.cardId}`}>{c.displayName.value ?? c.cardId}</Link>
                <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 13 }}>
                  {c.currentBillAmount.value == null && "fatura ausente · "}
                  {c.dueDay.confidence < 50 && "vencimento incerto · "}
                  {c.closingDay.confidence < 50 && "fechamento incerto"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
