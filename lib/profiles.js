import { supabase } from "./supabaseClient";
import { adminFetch } from "./adminFetch";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function getProfileById(id) {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
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
  // Prefer admin endpoint (bypasses RLS and keeps Auth email/profile in sync)
  try {
    await adminFetch("/api/admin/update-user", { method: "PATCH", body: { id, ...payload } });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("profiles").update(payload).eq("id", id);
    if (error) throw error;
  }
}

export async function setUserPassword(id, password) {
  await adminFetch("/api/admin/set-user-password", { method: "POST", body: { id, password } });
}

export async function deleteProfile(id) {
  ensure();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}