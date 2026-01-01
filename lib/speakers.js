import { supabase } from "./supabaseClient";
import { adminFetch } from "./adminFetch";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function listSpeakers() {
  // Prefer server-side endpoint (bypasses RLS and is faster/consistent)
  try {
    const payload = await adminFetch("/api/admin/speakers", { method: "GET" });
    return payload?.data || [];
  } catch (_) {
    // Fallback to direct client query (for environments without service role)
    ensure();
    const { data, error } = await supabase
      .from("speakers")
      .select("id, full_name, email, is_internal, vignette_name, created_at")
      .order("full_name", { ascending: true });
    if (error) throw error;
    return data || [];
  }
}

export async function createSpeaker(payload) {
  try {
    const out = await adminFetch("/api/admin/speakers", { method: "POST", body: payload });
    return { id: out?.id };
  } catch (_) {
    ensure();
    const { data, error } = await supabase
      .from("speakers")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }
}

export async function updateSpeaker(id, payload) {
  try {
    await adminFetch(`/api/admin/speakers/${id}`, { method: "PATCH", body: payload });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("speakers").update(payload).eq("id", id);
    if (error) throw error;
  }
}

export async function deleteSpeaker(id) {
  try {
    await adminFetch(`/api/admin/speakers/${id}`, { method: "DELETE" });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("speakers").delete().eq("id", id);
    if (error) throw error;
  }
}
