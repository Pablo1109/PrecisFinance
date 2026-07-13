import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { CardService } from "@/services/CardService";
import { supabase } from "@/lib/supabase";
import { FieldBreakdown } from "@/components/ui/FieldBreakdown";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const FIELDS: Array<{ key: keyof any; label: string; kind: "money" | "day" }> = [
  { key: "creditLimit", label: "Limite total", kind: "money" },
  { key: "availableLimit", label: "Limite disponível", kind: "money" },
  { key: "usedLimit", label: "Limite utilizado", kind: "money" },
  { key: "currentBillAmount", label: "Fatura atual", kind: "money" },
  { key: "closedBillAmount", label: "Fatura fechada", kind: "money" },
  { key: "minimumPayment", label: "Pagamento mínimo", kind: "money" },
  { key: "dueDay", label: "Dia de vencimento", kind: "day" },
  { key: "closingDay", label: "Dia de fechamento", kind: "day" },
  { key: "bestPurchaseDay", label: "Melhor dia de compra", kind: "day" },
];

const DB_FIELD_MAP: Record<string, string> = {
  creditLimit: "credit_limit",
  availableLimit: "available_limit",
  usedLimit: "used_limit",
  currentBillAmount: "current_bill_amount",
  closedBillAmount: "closed_bill_amount",
  minimumPayment: "minimum_payment",
  dueDay: "due_day",
  closingDay: "closing_day",
  bestPurchaseDay: "best_purchase_day",
};

export function CardDetailPage() {
  const { cardId = "" } = useParams();
  const qc = useQueryClient();
  const { data: card, isLoading } = useQuery({
    queryKey: ["card", cardId],
    queryFn: () => CardService.getResolved(cardId),
    enabled: !!cardId,
  });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Não autenticado");
      for (const [k, v] of Object.entries(edits)) {
        if (v.trim() === "") continue;
        const dbField = DB_FIELD_MAP[k];
        const parsed = k.endsWith("Day") ? parseInt(v, 10) : Number(v.replace(",", "."));
        if (Number.isNaN(parsed)) continue;
        await CardService.setOverride(uid, cardId, dbField, parsed, "user_correction");
      }
    },
    onSuccess: () => {
      setEdits({});
      qc.invalidateQueries({ queryKey: ["card", cardId] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    },
  });

  const revert = useMutation({
    mutationFn: async (dbField: string) => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Não autenticado");
      await CardService.clearOverride(uid, cardId, dbField);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card", cardId] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });

  if (isLoading || !card) return <p>Carregando…</p>;

  return (
    <>
      <h2>{card.displayName.value ?? "Cartão"}</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Cada campo mostra o valor sincronizado, manual (se houver) e o valor final que o Precis usa.
        Correções manuais são preservadas nas próximas sincronizações.
      </p>
      <div className="card" style={{ maxWidth: 720 }}>
        {FIELDS.map((f) => {
          const rf = (card as any)[f.key];
          const dbField = DB_FIELD_MAP[f.key as string];
          const fmt = f.kind === "money" ? brl : (d: number) => `dia ${d}`;
          return (
            <div key={f.key as string}>
              <FieldBreakdown
                field={rf}
                label={f.label}
                format={fmt}
                onRevert={rf.candidates?.some((c: { source: string }) => c.source === "manual")
                  ? () => revert.mutate(dbField)
                  : undefined}
              />
              <div style={{ marginBottom: 16 }}>
                <label>Corrigir manualmente</label>
                <input
                  placeholder={f.kind === "day" ? "1..31" : "0.00"}
                  value={edits[f.key as string] ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [f.key as string]: e.target.value }))}
                />
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando…" : "Aplicar correções"}
          </button>
          {save.isError && <span style={{ color: "var(--danger)" }}>{(save.error as Error).message}</span>}
        </div>
      </div>
    </>
  );
}
