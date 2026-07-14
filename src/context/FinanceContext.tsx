import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { FinanceState, SyncStatus, Transaction, Investment, TxType, RecurringBill } from "@/domain/types";
import { createDemoState, createEmptyState, normalizeState } from "@/domain/seed";
import { applyTransactionImpact } from "@/domain/finance";
import { FinanceStateRepository } from "@/repositories/FinanceStateRepository";
import { useAuth } from "./AuthContext";
import { uid } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { syncAll } from "@/pluggy";

interface FinanceCtx {
  state: FinanceState | null;
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

// Helper function to merge Supabase tables (pluggy_accounts, precis_cards, precis_entries) into FinanceState
async function mergeDatabaseIntoState(baseState: FinanceState, userId: string): Promise<FinanceState> {
  const next = JSON.parse(JSON.stringify(baseState)) as FinanceState;

  try {
    // 1. Fetch Open Finance checking and savings accounts
    const { data: dbAccounts } = await supabase
      .from("pluggy_accounts")
      .select("*")
      .eq("user_id", userId);

    // Keep only manual accounts
    next.accounts = next.accounts.filter((a) => a.source !== "pluggy" && !a.pluggyAccountId);

    if (dbAccounts && dbAccounts.length > 0) {
      // Append Open Finance accounts
      dbAccounts.forEach((acc: any) => {
        if (acc.type !== "CREDIT") {
          // Detect bank colors for premium design
          let color = "#1e293b";
          const bankName = (acc.marketing_name || acc.name || "").toLowerCase();
          if (bankName.includes("nubank")) color = "#830ad1";
          else if (bankName.includes("itau") || bankName.includes("itaú")) color = "#ff6a00";
          else if (bankName.includes("bradesco")) color = "#cc092f";
          else if (bankName.includes("inter")) color = "#ff7a00";
          else if (bankName.includes("santander")) color = "#ec0000";
          else if (bankName.includes("caixa")) color = "#1f509e";
          else if (bankName.includes("brasil") || bankName.includes("bb")) color = "#fcf803";

          next.accounts.push({
            id: acc.account_id,
            name: acc.marketing_name || acc.name || "Conta Open Finance",
            type: acc.subtype === "CHECKING_ACCOUNT" ? "Conta Corrente" : acc.subtype === "SAVINGS_ACCOUNT" ? "Poupança" : "Conta",
            currency: acc.currency_code || "BRL",
            balance: Number(acc.balance || 0),
            color,
            source: "pluggy",
            pluggyAccountId: acc.account_id,
            pluggyItemId: acc.item_id,
          });
        }
      });
    }

    // Keep only manual cards
    next.cards = next.cards.filter((c) => c.source === "manual");

    // 3. Fetch precis entries (transactions) - Manual only!
    const { data: dbEntries } = await supabase
      .from("precis_entries")
      .select("*")
      .eq("user_id", userId)
      .eq("source", "manual");

    // Keep only manual local transactions
    next.transactions = next.transactions.filter((t) => t.source !== "pluggy");

    if (dbEntries && dbEntries.length > 0) {
      // Remove any local transactions that are already stored in the DB
      next.transactions = next.transactions.filter((t) => !dbEntries.some((e) => e.id === t.id));

      // Append database transactions
      dbEntries.forEach((e: any) => {
        let type: TxType = e.direction === "credit" ? "income" : "expense";
        let categoryId = e.category_id || "outros";
        const desc = (e.description || "").toLowerCase();

        // 1. Detect investment transfers
        const isInvestment = /rdb|cdb|aplicac|resgate|invest|poupanca|poupança/i.test(desc);
        if (isInvestment) {
          type = "transfer";
          categoryId = "cat_investment";
        }

        // 2. Detect transfers between own accounts
        const isTransfer = /transfer|ted|doc|pix|recebida|enviada/i.test(desc);
        const isOwn = /pablo.*melo/i.test(desc);
        if (isTransfer && isOwn) {
          type = "transfer";
          categoryId = "cat_transfer";
        }

        // 3. Fallback standard categories if not classified
        if (categoryId === "outros" || !categoryId) {
          if (/supermercado|mercado|ifood|refeicao|restaurante|pizzaria|burger/i.test(desc)) {
            categoryId = "cat_food";
          } else if (/aluguel|condominio|reforma|energia|luz|agua|gás|gas|internet/i.test(desc)) {
            categoryId = "cat_home";
          } else if (/uber|cabify|99taxis|posto|combustivel|gasolina|pedagio|estaciona/i.test(desc)) {
            categoryId = "cat_transport";
          } else if (/farmacia|drogaria|saude|hospital|medico|odonto|clinica/i.test(desc)) {
            categoryId = "cat_health";
          } else if (/netflix|spotify|prime|hbo|disney|globo/i.test(desc)) {
            categoryId = "cat_subs";
          } else if (/fatura|anuidade|tarifa|juros/i.test(desc)) {
            categoryId = "cat_cards";
          } else if (/cinema|teatro|show|viagem|decolar|hotel|voo|lazer/i.test(desc)) {
            categoryId = "cat_leisure";
          }
        }

        next.transactions.push({
          id: e.id,
          type,
          date: e.date,
          description: e.description,
          amount: Number(e.amount),
          currency: e.currency_code || "BRL",
          accountId: e.account_id || "",
          cardId: e.card_id || "",
          categoryId,
          subcategory: e.subcategory || "",
          tags: (e.tags || []).join(", "),
          location: "",
          note: e.notes || "",
          recurring: false,
          source: e.source === "openfinance" ? "pluggy" : "manual",
          pluggyTransactionId: e.source_ref || undefined,
          reviewed: e.reviewed ?? true,
          ignored: e.ignored ?? false,
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        });
      });

      // Sort descending by date
      next.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }

    // 4. Fetch Open Finance investments
    const { data: dbInvestments } = await supabase
      .from("pluggy_investments")
      .select("*")
      .eq("user_id", userId);

    if (!next.investments) next.investments = [];
    next.investments = next.investments.filter((i) => i.source !== "pluggy");

    if (dbInvestments && dbInvestments.length > 0) {
      dbInvestments.forEach((inv: any) => {
        next.investments.push({
          id: inv.investment_id,
          name: inv.name || "Investimento Open Finance",
          type: inv.type || "Renda Fixa",
          subtype: inv.subtype || "Outros",
          balance: Number(inv.balance || 0),
          currency: inv.currency_code || "BRL",
          source: "pluggy",
        });
      });
    }

    // 5. Fetch recurring bills
    const { data: dbBills } = await supabase
      .from("precis_recurring_bills")
      .select("*")
      .eq("user_id", userId);

    next.recurringBills = [];
    if (dbBills && dbBills.length > 0) {
      dbBills.forEach((b: any) => {
        next.recurringBills!.push({
          id: b.id,
          description: b.description,
          amount: Number(b.amount || 0),
          dueDay: b.due_day || 10,
          categoryId: b.category_id || "outros",
          createdAt: b.created_at,
        });
      });
    }
  } catch (err) {
    console.error("Erro ao sincronizar tabelas com o estado", err);
  }

  return next;
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth();
  const [state, setState] = useState<FinanceState | null>(null);
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

      if (configured) {
        loaded = await mergeDatabaseIntoState(loaded, user.id);
        syncAll(supabase).catch((e) => console.warn("Background Open Finance sync skipped/failed", e));
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
      setState(merged);
      setSyncStatus("sincronizado");
    } catch (e) {
      console.error(e);
      setSyncStatus("pendente");
    }
  }, [user, configured]);

  const syncTimer = useRef<ReturnType<typeof setTimeout>>();

  const triggerRealtimeSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncDatabase();
    }, 500);
  }, [syncDatabase]);

  useEffect(() => {
    if (!user || !configured) return;

    const channel = supabase
      .channel("open-finance-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pluggy_accounts", filter: `user_id=eq.${user.id}` },
        () => {
          console.log("Realtime: pluggy_accounts mudou");
          triggerRealtimeSync();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "precis_cards", filter: `user_id=eq.${user.id}` },
        () => {
          console.log("Realtime: precis_cards mudou");
          triggerRealtimeSync();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "precis_entries", filter: `user_id=eq.${user.id}` },
        () => {
          console.log("Realtime: precis_entries mudou");
          triggerRealtimeSync();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pluggy_investments", filter: `user_id=eq.${user.id}` },
        () => {
          console.log("Realtime: pluggy_investments mudou");
          triggerRealtimeSync();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [user, configured, triggerRealtimeSync]);

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
      setState(demo);
      scheduleSave(demo);
    },
    exportJson: () => JSON.stringify(state, null, 2),
    importJson: (json) => {
      const parsed = normalizeState(JSON.parse(json));
      setState(parsed);
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

