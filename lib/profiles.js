import { supabase } from "./supabaseClient";
import { adminFetch } from "./adminFetch";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function getProfileById(id) {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, permissions, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}


export async function listProfiles() {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role, permissions, is_active, created_at")
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
    .select("id, name, email, role, permissions, is_active, created_at")
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
    const out = await adminFetch("/api/admin/update-user", { method: "PATCH", body: { id, ...payload } });
    return out?.profile || null;
  } catch (e) {
    // Fallback: direct update (may be blocked by RLS depending on policies)
    ensure();
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", id)
      .select("id, name, email, role, permissions, is_active, created_at")
      .single();
    if (error) throw error;
    return data || null;
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

// =========================
// Self-service (Minha conta)
// =========================

export async function updateMyProfile(payload) {
  ensure();
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const uid = authData?.user?.id;
  if (!uid) throw new Error("Sessão inválida.");

  const safe = {
    name: typeof payload?.name === "string" ? payload.name.trim() : undefined,
    email: typeof payload?.email === "string" ? (payload.email.trim() || null) : undefined
  };

  // Não permite editar role/is_active via self-service
  const { error } = await supabase
    .from("profiles")
    .update({
      ...(safe.name !== undefined ? { name: safe.name } : {}),
      ...(safe.email !== undefined ? { email: safe.email } : {})
    })
    .eq("id", uid);
  if (error) throw error;
}

export async function updateMyAuth({ email, password } = {}) {
  ensure();
  const patch = {};
  if (typeof email === "string" && email.trim()) patch.email = email.trim();
  if (typeof password === "string" && password) patch.password = password;
  if (!patch.email && !patch.password) return;

  const { error } = await supabase.auth.updateUser(patch);
  if (error) throw error;
}