export function normalizeDesc(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function txHash(input: { accountId: string; date: string; amount: number; description: string; sourceRef?: string }): Promise<string> {
  const key = [input.accountId, input.date, input.amount.toFixed(2), normalizeDesc(input.description), input.sourceRef ?? ""].join("|");
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
