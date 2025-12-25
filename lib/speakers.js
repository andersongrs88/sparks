import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function listSpeakers() {
  ensure();
  const { data, error } = await supabase
    .from("speakers")
    .select("id, full_name, email, is_internal, vignette_name, created_at")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createSpeaker(payload) {
  ensure();
  const { data, error } = await supabase
    .from("speakers")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSpeaker(id, payload) {
  ensure();
  const { error } = await supabase.from("speakers").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteSpeaker(id) {
  ensure();
  const { error } = await supabase.from("speakers").delete().eq("id", id);
  if (error) throw error;
}
