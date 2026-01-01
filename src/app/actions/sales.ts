"use server";

import { supabaseServer } from "@/lib/supabaseServer";

export type SalePaymentMethod = "cash" | "pix" | "card";

export async function createSaleFromAppointment(appointmentId: string) {
  const supabase = supabaseServer();
  const { data, error } = await supabase.rpc("rpc_create_sale_from_appointment", {
    p_appointment_id: appointmentId,
  });
  if (error) throw new Error(error.message);
  return data as string; // sale_id
}

export async function createSale(params: {
  unitId: string;
  customerId?: string | null;
  professionalId?: string | null;
  notes?: string | null;
}) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("sales")
    .insert({
      unit_id: params.unitId,
      customer_id: params.customerId ?? null,
      professional_id: params.professionalId ?? null,
      status: "open",
      discount_cents: 0,
      notes: params.notes ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function addSaleItem(params: {
  saleId: string;
  catalogItemId: string;
  qty: number;
  unitPriceCents: number;
  discountCents?: number;
  professionalId?: string | null;
  notes?: string | null;
}) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("sale_items").insert({
    sale_id: params.saleId,
    catalog_item_id: params.catalogItemId,
    qty: params.qty,
    unit_price_cents: params.unitPriceCents,
    discount_cents: params.discountCents ?? 0,
    total_cents: 0, // calculado via constraint/trigger (mantém compatibilidade)
    professional_id: params.professionalId ?? null,
    notes: params.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function removeSaleItem(saleItemId: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("sale_items").delete().eq("id", saleItemId);
  if (error) throw new Error(error.message);
  return true;
}

export async function applySaleDiscount(saleId: string, discountCents: number) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("sales").update({ discount_cents: discountCents }).eq("id", saleId);
  if (error) throw new Error(error.message);
  // garante recálculo imediatamente (trigger de updated_at não cobre total)
  const { error: recalcError } = await supabase.rpc("recalc_sale_totals", { p_sale_id: saleId });
  if (recalcError) throw new Error(recalcError.message);
  return true;
}

export async function addPayment(saleId: string, method: SalePaymentMethod, amountCents: number) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("sale_payments").insert({
    sale_id: saleId,
    method,
    amount_cents: amountCents,
    status: "authorized",
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function deletePayment(paymentId: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("sale_payments").delete().eq("id", paymentId);
  if (error) throw new Error(error.message);
  return true;
}

export async function finalizeSale(saleId: string) {
  const supabase = supabaseServer();
  const { error } = await supabase.rpc("rpc_finalize_sale", {
    p_sale_id: saleId,
    p_capture_payments: true,
    p_complete_appointment: true,
  });
  if (error) throw new Error(error.message);
  return true;
}
