import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FinanceState, SyncStatus, Transaction } from "@/domain/types";
import { createDemoState, createEmptyState, normalizeState } from "@/domain/seed";
import { applyTransactionImpact } from "@/domain/finance";
import { FinanceStateRepository } from "@/repositories/FinanceStateRepository";
import { useAuth } from "./AuthContext";
import { uid } from "@/lib/format";

interface FinanceCtx {
  state: FinanceState | null;
  syncStatus: SyncStatus;
  ready: boolean;
  setSelectedMonth: (m: string) => void;
  update: (fn: (s: FinanceState) => void, message?: string) => void;
  addTransaction: (tx: Omit<Transaction, "id" | "createdAt">) => void;
  deleteTransaction: (id: string) => void;
  resetDemo: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
}

const FinanceContext = createContext<FinanceCtx | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth();
  const [state, setState] = useState<FinanceState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("desconectado");
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastCloud = useRef("");

  const persist = useCallback(
    async (next: FinanceState) => {
      if (!user) {
        setSyncStatus("somente local");
        return;
      }
      FinanceStateRepository.saveCache(user.id, next, lastCloud.current, true);
      if (!configured) return;
      setSyncStatus("sincronizando");
      try {
        const at = await FinanceStateRepository.save(user.id, next);
        lastCloud.current = at;
        FinanceStateRepository.saveCache(user.id, next, at, false);
        setSyncStatus("sincronizado");
      } catch {
        setSyncStatus("pendente");
      }
    },
    [user, configured],
  );

  const scheduleSave = useCallback(
    (next: FinanceState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 400);
    },
    [persist],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      if (!user) {
        setState(createEmptyState());
        setSyncStatus(configured ? "desconectado" : "somente local");
        setReady(true);
        return;
      }
      const cache = FinanceStateRepository.loadCache(user.id);
      let cloud: Awaited<ReturnType<typeof FinanceStateRepository.load>> = null;
      if (configured) {
        try {
          cloud = await FinanceStateRepository.load(user.id);
        } catch {
          /* offline */
        }
      }
      let loaded = createEmptyState();
      if (cloud && cache) {
        loaded = cloud.updatedAt >= cache.updatedAt ? cloud.state : cache.state;
        lastCloud.current = cloud.updatedAt;
      } else if (cloud) {
        loaded = cloud.state;
        lastCloud.current = cloud.updatedAt;
      } else if (cache) {
        loaded = cache.state;
      } else {
        const legacy = FinanceStateRepository.loadLegacy();
        loaded = legacy ?? createDemoState();
      }
      if (!cancelled) {
        setState(loaded);
        setSyncStatus(cloud ? "sincronizado" : "somente local");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, configured]);

  const update = useCallback(
    (fn: (s: FinanceState) => void, _message?: string) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = normalizeState(JSON.parse(JSON.stringify(prev)) as FinanceState);
        fn(next);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const value: FinanceCtx = {
    state,
    syncStatus,
    ready,
    setSelectedMonth: (m) => update((s) => { s.settings.selectedMonth = m; }),
    update,
    addTransaction: (tx) =>
      update((s) => {
        const full: Transaction = { ...tx, id: uid("tx"), createdAt: new Date().toISOString() };
        s.transactions.unshift(full);
        applyTransactionImpact(s, full, 1);
      }),
    deleteTransaction: (id) =>
      update((s) => {
        const tx = s.transactions.find((t) => t.id === id);
        if (!tx || tx.source === "pluggy") return;
        applyTransactionImpact(s, tx, -1);
        s.transactions = s.transactions.filter((t) => t.id !== id);
      }),
    resetDemo: () => {
      const demo = createDemoState();
      setState(demo);
      scheduleSave(demo);
    },
    exportJson: () => JSON.stringify(state, null, 2),
    importJson: (json) => {
      const parsed = normalizeState(JSON.parse(json));
      setState(parsed);
      scheduleSave(parsed);
    },
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance fora do FinanceProvider");
  return ctx;
}
