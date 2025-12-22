import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

const TASKS_TABLE = "immersion_tasks";

export async function listTasksByImmersion(immersion_id) {
  ensure();
  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select("id, created_at, immersion_id, phase, title, owner_profile_id, due_date, status, notes")
    .eq("immersion_id", immersion_id)
    .order("phase", { ascending: true })
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTask(payload) {
  ensure();
  const { data, error } = await supabase.from(TASKS_TABLE).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, patch) {
  ensure();
  const { error } = await supabase.from(TASKS_TABLE).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id) {
  ensure();
  const { error } = await supabase.from(TASKS_TABLE).delete().eq("id", id);
  if (error) throw error;
}
