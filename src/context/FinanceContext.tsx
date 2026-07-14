import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import type { FinanceState, SyncStatus, Transaction, Investment, TxType, RecurringBill } from "@/domain/types";
import { createDemoState, createEmptyState, normalizeState } from "@/domain/seed";
import { applyTransactionImpact, mergeStates } from "@/domain/finance";
import { FinanceStateRepository } from "@/repositories/FinanceStateRepository";
import { useAuth } from "./AuthContext";
import { uid } from "@/lib/format";
import { supabase } from "@/lib/supabase";

interface FinanceCtx {
  state: FinanceState | null;
  rawState: FinanceState | null;
  spouseState: FinanceState | null;
  isFamilyMode: boolean;
  setIsFamilyMode: (val: boolean) => void;
  syncStatus: SyncStatus;
  ready: boolean;
  setSelectedMonth: (m: string) => void;
  update: (fn: (s: FinanceState) => void, message?: string) => void;
  addTransaction: (tx: Omit<Transaction, "id" | "createdAt">) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  resetDemo: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
  syncDatabase: () => Promise<void>;
  addInvestment: (inv: Omit<Investment, "id">) => void;
  deleteInvestment: (id: string) => void;
  reviewTransaction: (id: string, action: "ignore" | "debit" | "credit" | "split", opts?: { cardId?: string; installments?: number }) => Promise<void>;
  addRecurringBill: (bill: Omit<RecurringBill, "id">) => Promise<void>;
  deleteRecurringBill: (id: string) => Promise<void>;
  showQuickInsert: boolean;
  setShowQuickInsert: (open: boolean) => void;
}

const FinanceContext = createContext<FinanceCtx | null>(null);

// Helper function to merge Supabase tables (precis_entries, precis_recurring_bills) into FinanceState (Manual ONLY)
async function mergeDatabaseIntoState(baseState: FinanceState, userId: string): Promise<FinanceState> {
  const next = JSON.parse(JSON.stringify(baseState)) as FinanceState;

  try {
    // Keep only manual items in state arrays
    next.accounts = (next.accounts || []).filter((a) => a.source === "manual");
    next.cards = (next.cards || []).filter((c) => c.source === "manual");
    next.transactions = (next.transactions || []).filter((t) => t.source === "manual");
    next.investments = (next.investments || []).filter((i) => i.source === "manual");

    // 1. Fetch precis entries (transactions) - Manual only
    const { data: dbEntries } = await supabase
      .from("precis_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "manual");

    if (dbEntries && dbEntries.length > 0) {
      // Remove any local transactions that are already stored in the DB to avoid duplicates
      next.transactions = next.transactions.filter((t) => !dbEntries.some((e) => e.id === t.id));

      dbEntries.forEach((e: any) => {
        let type: TxType = e.direction === "credit" ? "income" : "expense";
        next.transactions.push({
          id: e.id,
          type,
          date: e.date,
          description: e.description,
          amount: Number(e.amount),
          currency: e.currency_code || "BRL",
          accountId: e.account_id || "",
          cardId: e.card_id || "",
          categoryId: e.category_id || "outros",
          subcategory: e.subcategory || "",
          tags: (e.tags || []).join(", "),
          location: "",
          note: e.notes || "",
          recurring: false,
          source: "manual",
          reviewed: e.reviewed ?? true,
          ignored: e.ignored ?? false,
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        });
      });

      next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }

    // 2. Fetch recurring bills
    const { data: dbBills } = await supabase
      .from("precis_recurring_bills")
      .select("*")
      .eq("user_id", userId);

    if (dbBills && dbBills.length > 0) {
      next.recurringBills = next.recurringBills || [];
      next.recurringBills = next.recurringBills.filter((b) => !dbBills.some((db) => db.id === b.id));
      dbBills.forEach((b: any) => {
        next.recurringBills!.push({
          id: b.id,
          type: b.type || "expense",
          description: b.description,
          amount: Number(b.amount || 0),
          dueDay: b.due_day || 10,
          categoryId: b.category_id || "",
          createdAt: b.created_at,
        });
      });
    }
  } catch (e) {
    console.error("Erro ao sincronizar tabelas manuais:", e);
  }

  return next;
};

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth();
  const [rawState, setRawState] = useState<FinanceState | null>(null);
  const [spouseState, setSpouseState] = useState<FinanceState | null>(null);
  const [isFamilyMode, setIsFamilyMode] = useState(() => localStorage.getItem("is_family_mode") === "true");

  useEffect(() => {
    localStorage.setItem("is_family_mode", String(isFamilyMode));
  }, [isFamilyMode]);

  const state = useMemo(() => {
    if (isFamilyMode && spouseState && rawState) {
      return mergeStates(rawState, spouseState);
    }
    return rawState;
  }, [isFamilyMode, spouseState, rawState]);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("desconectado");
  const [ready, setReady] = useState(false);
  const [showQuickInsert, setShowQuickInsert] = useState(false);
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

  const syncSpouseState = useCallback(async (spouseId: string) => {
    if (!spouseId || !configured) {
      setSpouseState(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("finance_states")
        .select("state")
        .eq("user_id", spouseId)
        .maybeSingle();
      if (error) throw error;
      if (data?.state) {
        const baseSpouseState = normalizeState(data.state);
        // Load spouse manual transactions and recurring bills from database
        const mergedSpouseState = await mergeDatabaseIntoState(baseSpouseState, spouseId);
        setSpouseState(mergedSpouseState);
      } else {
        setSpouseState(null);
      }
    } catch (e) {
      console.warn("Could not load spouse state:", e);
      setSpouseState(null);
    }
  }, [configured]);

  useEffect(() => {
    if (rawState?.settings.spouseId) {
      syncSpouseState(rawState.settings.spouseId);
    } else {
      setSpouseState(null);
    }
  }, [rawState?.settings.spouseId, syncSpouseState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      if (!user) {
        setRawState(createEmptyState());
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

      if (configured) {
        loaded = await mergeDatabaseIntoState(loaded, user.id);
      }

      if (!cancelled) {
        setRawState(loaded);
        setSyncStatus(cloud ? "sincronizado" : "somente local");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, configured]);

  const syncDatabase = useCallback(async () => {
    if (!user || !configured) return;
    setSyncStatus("sincronizando");
    try {
      const cache = FinanceStateRepository.loadCache(user.id);
      let baseState = cache?.state;
      if (!baseState) {
        const cloud = await FinanceStateRepository.load(user.id);
        baseState = cloud?.state ?? createEmptyState();
      }
      const merged = await mergeDatabaseIntoState(baseState, user.id);
      setRawState(merged);
      setSyncStatus("sincronizado");
    } catch (e) {
      console.error(e);
      setSyncStatus("pendente");
    }
  }, [user, configured]);

  useEffect(() => {
    if (!user || !configured) return;

    const channel = supabase
      .channel("finance-states-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_states" },
        (payload: any) => {
          console.log("Realtime: finance_states mudou", payload);
          if (payload.new && payload.new.user_id === user.id) {
            syncDatabase();
          }
          if (payload.new && rawState?.settings.spouseId && payload.new.user_id === rawState.settings.spouseId) {
            syncSpouseState(rawState.settings.spouseId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, configured, rawState?.settings.spouseId, syncDatabase, syncSpouseState]);

  const update = useCallback(
    (fn: (s: FinanceState) => void, _message?: string) => {
      setRawState((prev) => {
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
    rawState,
    spouseState,
    isFamilyMode,
    setIsFamilyMode,
    syncStatus,
    ready,
    showQuickInsert,
    setShowQuickInsert,
    setSelectedMonth: (m) => update((s) => { s.settings.selectedMonth = m; }),
    update,
    addTransaction: (tx) => {
      const txId = uid("tx");
      const full: Transaction = { ...tx, id: txId, createdAt: new Date().toISOString() };
      update((s) => {
        s.transactions.unshift(full);
        applyTransactionImpact(s, full, 1);
      });

      if (configured && user) {
        supabase.from("precis_entries").insert({
          id: txId,
          user_id: user.id,
          account_id: tx.accountId || null,
          card_id: tx.cardId || null,
          date: tx.date,
          amount: tx.amount,
          currency_code: tx.currency || "BRL",
          direction: tx.type === "income" ? "credit" : "debit",
          description: tx.description,
          category_id: tx.categoryId || null,
          subcategory: tx.subcategory || null,
          notes: tx.note || null,
          source: "manual",
          confidence: 100,
        }).then(({ error }) => {
          if (error) console.error("Erro ao inserir transação manual no banco", error);
        });
      }
    },
    deleteTransaction: (id) => {
      update((s) => {
        const tx = s.transactions.find((t) => t.id === id);
        if (!tx) return;
        applyTransactionImpact(s, tx, -1);
        s.transactions = s.transactions.filter((t) => t.id !== id);
      });

      if (configured && user) {
        supabase.from("precis_entries").delete().eq("id", id).then(({ error }) => {
          if (error) console.error("Erro ao deletar transação no banco", error);
        });
      }
    },
    updateTransaction: (id, patch) => {
      update((s) => {
        const tx = s.transactions.find((t) => t.id === id);
        if (!tx) return;
        applyTransactionImpact(s, tx, -1);
        Object.assign(tx, patch);
        applyTransactionImpact(s, tx, 1);
      });

      if (configured && user) {
        const dbPatch: any = {};
        if (patch.description !== undefined) dbPatch.description = patch.description;
        if (patch.amount !== undefined) dbPatch.amount = patch.amount;
        if (patch.date !== undefined) dbPatch.date = patch.date;
        if (patch.categoryId !== undefined) dbPatch.category_id = patch.categoryId || null;
        if (patch.subcategory !== undefined) dbPatch.subcategory = patch.subcategory || null;
        if (patch.type !== undefined) dbPatch.direction = patch.type === "income" ? "credit" : "debit";
        if (patch.accountId !== undefined) dbPatch.account_id = patch.accountId || null;
        if (patch.cardId !== undefined) dbPatch.card_id = patch.cardId || null;
        if (patch.note !== undefined) dbPatch.notes = patch.note || null;

        supabase.from("precis_entries").update(dbPatch).eq("id", id).then(({ error }) => {
          if (error) console.error("Erro ao atualizar transação no banco", error);
        });
      }
    },
    resetDemo: () => {
      const demo = createDemoState();
      setRawState(demo);
      scheduleSave(demo);
    },
    exportJson: () => JSON.stringify(state, null, 2),
    importJson: (json) => {
      const parsed = normalizeState(JSON.parse(json));
      setRawState(parsed);
      scheduleSave(parsed);
    },
    syncDatabase,
    addInvestment: (inv) =>
      update((s) => {
        if (!s.investments) s.investments = [];
        s.investments.push({ ...inv, id: uid("inv") });
      }),
    deleteInvestment: (id) =>
      update((s) => {
        if (!s.investments) s.investments = [];
        s.investments = s.investments.filter((i) => i.id !== id);
      }),
    reviewTransaction: async (id, action, opts) => {
      update((s) => {
        const tx = s.transactions.find((t) => t.id === id);
        if (!tx) return;

        if (action === "ignore") {
          tx.ignored = true;
          tx.reviewed = true;
        } else if (action === "debit") {
          tx.cardId = "";
          tx.reviewed = true;
        } else if (action === "credit") {
          tx.cardId = opts?.cardId || "";
          tx.reviewed = true;
        } else if (action === "split") {
          tx.ignored = true;
          tx.reviewed = true;

          const totalAmount = tx.amount;
          const installmentsCount = opts?.installments || 2;
          const splitAmount = +(totalAmount / installmentsCount).toFixed(2);
          const [y, m, d] = tx.date.split("-").map(Number);

          for (let i = 0; i < installmentsCount; i++) {
            let nextYear = y;
            let nextMonth = m + i;
            while (nextMonth > 12) {
              nextMonth -= 12;
              nextYear += 1;
            }
            const dateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const subTx: Transaction = {
              id: uid("tx"),
              type: tx.type,
              date: dateStr,
              description: `${tx.description} (${i + 1}/${installmentsCount})`,
              amount: splitAmount,
              currency: tx.currency || "BRL",
              accountId: tx.accountId,
              cardId: opts?.cardId || tx.cardId || "",
              categoryId: tx.categoryId,
              subcategory: tx.subcategory,
              tags: tx.tags,
              location: "",
              note: `Parcelamento de ${tx.description}`,
              recurring: false,
              source: "manual",
              createdAt: new Date().toISOString(),
            };

            s.transactions.push(subTx);

            if (configured && user) {
              supabase.from("precis_entries").insert({
                id: subTx.id,
                user_id: user.id,
                account_id: subTx.accountId || null,
                card_id: subTx.cardId || null,
                date: subTx.date,
                amount: subTx.amount,
                currency_code: subTx.currency,
                direction: subTx.type === "income" ? "credit" : "debit",
                description: subTx.description,
                category_id: subTx.categoryId || null,
                subcategory: subTx.subcategory || null,
                notes: subTx.note || null,
                source: "manual",
                confidence: 100,
              }).then(({ error }) => {
                if (error) console.error("Erro ao inserir parcela no banco", error);
              });
            }
          }
        }
      });

      if (configured && user) {
        const patch: any = { reviewed: true };
        if (action === "ignore") patch.ignored = true;
        else if (action === "debit") patch.card_id = null;
        else if (action === "credit") patch.card_id = opts?.cardId || null;
        else if (action === "split") patch.ignored = true;

        await supabase.from("precis_entries").update(patch).eq("id", id);
      }
    },
    addRecurringBill: async (bill) => {
      const billId = uid("bill");
      update((s) => {
        if (!s.recurringBills) s.recurringBills = [];
        s.recurringBills.push({ ...bill, id: billId });
      });

      if (configured && user) {
        const { error } = await supabase.from("precis_recurring_bills").insert({
          id: billId,
          user_id: user.id,
          description: bill.description,
          amount: bill.amount,
          due_day: bill.dueDay,
          category_id: bill.categoryId,
        });
        if (error) console.error("Erro ao cadastrar conta fixa no banco", error);
      }
    },
    deleteRecurringBill: async (id) => {
      update((s) => {
        if (!s.recurringBills) s.recurringBills = [];
        s.recurringBills = s.recurringBills.filter((b) => b.id !== id);
      });

      if (configured && user) {
        const { error } = await supabase.from("precis_recurring_bills").delete().eq("id", id);
        if (error) console.error("Erro ao deletar conta fixa no banco", error);
      }
    },
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance fora do FinanceProvider");
  return ctx;
}

