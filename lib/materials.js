import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listMaterials(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_materials")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("material", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createMaterial(payload) {
  ensure();
  const { error } = await supabase.from("immersion_materials").insert([payload]);
  if (error) throw error;
}

export async function updateMaterial(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_materials").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteMaterial(id) {
  ensure();
  const { error } = await supabase.from("immersion_materials").delete().eq("id", id);
  if (error) throw error;
}
