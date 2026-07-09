import { supabase } from "@/lib/supabase";

/** Row cru da tabela precis_cards. */
export interface CardRow {
  card_id: string;
  item_id: string;
  user_id: string;
  display_name: string | null;
  brand: string | null;
  last_four: string | null;
  credit_limit: number | null;
  available_limit: number | null;
  used_limit: number | null;
  current_bill_amount: number | null;
  closed_bill_amount: number | null;
  minimum_payment: number | null;
  due_day: number | null;
  closing_day: number | null;
  best_purchase_day: number | null;
  next_due_date: string | null;
  next_closing_date: string | null;
  future_installments: number;
  current_installments: number;
  currency_code: string;
  updated_at: string;
}

export const CardsRepository = {
  async listAll(): Promise<CardRow[]> {
    const { data, error } = await supabase
      .from("precis_cards")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CardRow[];
  },
  async getById(cardId: string): Promise<CardRow | null> {
    const { data, error } = await supabase.from("precis_cards").select("*").eq("card_id", cardId).maybeSingle();
    if (error) throw error;
    return (data as CardRow | null) ?? null;
  },
};
