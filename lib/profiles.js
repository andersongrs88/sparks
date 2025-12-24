import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function listProfiles() {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Conveniência: retorna apenas perfis ativos (usado em selects de responsáveis).
export async function listActiveProfiles() {
  const all = await listProfiles();
  return (all || []).filter((p) => !!p.is_active);
}

export async function getProfile(id) {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active, created_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createProfile(payload) {
  ensure();
  const { error } = await supabase.from("profiles").insert([payload]);
  if (error) throw error;
}

export async function updateProfile(id, payload) {
  ensure();
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteProfile(id) {
  ensure();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}
