import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listPdcaItems(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_pdca")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createPdcaItem(payload) {
  ensure();
  const { error } = await supabase.from("immersion_pdca").insert([payload]);
  if (error) throw error;
}

export async function updatePdcaItem(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_pdca").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deletePdcaItem(id) {
  ensure();
  const { error } = await supabase.from("immersion_pdca").delete().eq("id", id);
  if (error) throw error;
}
