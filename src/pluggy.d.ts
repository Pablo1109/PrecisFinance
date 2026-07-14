export function openPluggyConnect(
  supabaseClient: unknown,
  opts?: { itemId?: string; onSuccess?: (payload: unknown) => void; onError?: (e: unknown) => void; onClose?: () => void },
): Promise<unknown>;

export function syncItem(supabaseClient: unknown, itemId: string, opts?: { full?: boolean }): Promise<unknown>;
export function syncAll(supabaseClient: unknown, opts?: { full?: boolean }): Promise<{ items: number; total: number; errors?: unknown[] }>;
export function listRemoteItems(supabaseClient: unknown): Promise<unknown[]>;
export function getPluggyItems(supabaseClient: unknown): Promise<unknown[]>;
export function getPluggyAccounts(supabaseClient: unknown): Promise<unknown[]>;
export function getPluggyCards(supabaseClient: unknown): Promise<unknown[]>;
export function getPluggyTransactions(supabaseClient: unknown, opts?: { limit?: number }): Promise<unknown[]>;
export function getPluggyBills(supabaseClient: unknown): Promise<unknown[]>;
export function disconnectAllOpenFinance(supabaseClient: unknown, userId: string): Promise<void>;
export function deletePluggyItem(supabaseClient: unknown, itemId: string, userId: string): Promise<void>;
