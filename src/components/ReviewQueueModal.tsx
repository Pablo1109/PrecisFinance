import { useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { money, fmtDate } from "@/lib/format";
import type { Transaction } from "@/domain/types";

interface ReviewQueueModalProps {
  pending: Transaction[];
  onClose: () => void;
}

export function ReviewQueueModal({ pending, onClose }: ReviewQueueModalProps) {
  const { state, reviewTransaction } = useFinance();
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"choose" | "card" | "split">("choose");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [installments, setInstallments] = useState(2);
  const [busy, setBusy] = useState(false);

  if (pending.length === 0 || !state) return null;

  const current = pending[index];
  const cards = state.cards || [];

  async function handleAction(action: "ignore" | "debit" | "credit" | "split") {
    setBusy(true);
    try {
      await reviewTransaction(current.id, action, {
        cardId: action === "credit" || action === "split" ? selectedCardId : undefined,
        installments: action === "split" ? installments : undefined,
      });

      if (index + 1 < pending.length) {
        setIndex((prev) => prev + 1);
        setMode("choose");
        setSelectedCardId("");
        setInstallments(2);
      } else {
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content review-modal" style={{ maxWidth: 460 }}>
        <button type="button" className="close-modal" onClick={onClose}>&times;</button>
        
        {/* Progress header */}
        <header className="review-header">
          <span className="pill">Fila de Revisão</span>
          <span className="muted">{index + 1} de {pending.length} pendentes</span>
        </header>

        {/* Transaction details card */}
        <section className="review-tx-details">
          <div className="tx-amount negative">
            {money(current.amount)}
          </div>
          <div className="tx-desc">{current.description}</div>
          <div className="tx-meta">
            <span>📅 {fmtDate(current.date)}</span>
            {current.accountId && (
              <span>🏦 {state.accounts.find(a => a.id === current.accountId)?.name || "Conta OF"}</span>
            )}
          </div>
        </section>

        {mode === "choose" && (
          <div className="review-actions-grid">
            <button
              type="button"
              className="action-btn debit"
              disabled={busy}
              onClick={() => handleAction("debit")}
            >
              💵 Considerar no Débito
            </button>
            <button
              type="button"
              className="action-btn credit"
              disabled={busy || cards.length === 0}
              onClick={() => {
                if (cards.length > 0) {
                  setSelectedCardId(cards[0].id);
                  setMode("card");
                }
              }}
            >
              💳 Lançar no Cartão
            </button>
            <button
              type="button"
              className="action-btn split"
              disabled={busy}
              onClick={() => {
                setSelectedCardId(cards[0]?.id || "");
                setMode("split");
              }}
            >
              🥞 Parcelar Compra
            </button>
            <button
              type="button"
              className="action-btn ignore"
              disabled={busy}
              onClick={() => handleAction("ignore")}
            >
              🚫 Ignorar Lançamento
            </button>
          </div>
        )}

        {mode === "card" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAction("credit");
            }}
            className="review-subform"
          >
            <h4>Selecione o Cartão</h4>
            <label className="field">
              Cartão de Crédito
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                required
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Fechamento: dia {c.closingDay})
                  </option>
                ))}
              </select>
            </label>
            <div className="subform-actions">
              <button type="button" className="secondary-action" onClick={() => setMode("choose")}>
                Voltar
              </button>
              <button type="submit" className="primary-action" disabled={busy}>
                Confirmar
              </button>
            </div>
          </form>
        )}

        {mode === "split" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAction("split");
            }}
            className="review-subform"
          >
            <h4>Parcelar em quantas vezes?</h4>
            <div className="split-summary">
              <strong>{money(current.amount)}</strong> em {installments}x de <strong>{money(current.amount / installments)}</strong>
            </div>
            
            <label className="field">
              Número de Parcelas
              <input
                type="number"
                min={2}
                max={48}
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                required
              />
            </label>

            <label className="field">
              Lançar no Cartão (Opcional)
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
              >
                <option value="">Nenhum (Lançar na conta corrente)</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="subform-actions">
              <button type="button" className="secondary-action" onClick={() => setMode("choose")}>
                Voltar
              </button>
              <button type="submit" className="primary-action" disabled={busy}>
                Confirmar
              </button>
            </div>
          </form>
        )}

        {/* Progress Dots */}
        <div className="review-dots">
          {pending.map((_, i) => (
            <span key={i} className={`dot ${i === index ? "active" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
