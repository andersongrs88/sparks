"use server";

import { supabaseServer } from "@/lib/supabaseServer";

export async function openCashRegister(unitId: string, openingBalanceCents = 0, notes?: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.rpc("rpc_open_cash_register", {
    p_unit_id: unitId,
    p_opening_balance_cents: openingBalanceCents,
    p_notes: notes ?? null,
  });

  if (error) throw new Error(error.message);
  return data as string; // cash_register_id
}

export async function closeCashRegister(cashRegisterId: string, closingBalanceCents: number, notes?: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.rpc("rpc_close_cash_register", {
    p_cash_register_id: cashRegisterId,
    p_closing_balance_cents: closingBalanceCents,
    p_notes: notes ?? null,
  });

  if (error) throw new Error(error.message);
  return true;
}
