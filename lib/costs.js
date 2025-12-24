import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listCosts(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_costs")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("category", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCost(payload) {
  ensure();
  const { error } = await supabase.from("immersion_costs").insert([payload]);
  if (error) throw error;
}

export async function updateCost(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_costs").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteCost(id) {
  ensure();
  const { error } = await supabase.from("immersion_costs").delete().eq("id", id);
  if (error) throw error;
}
