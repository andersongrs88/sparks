import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no Netlify).");
}

export async function listTasksByImmersion(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_tasks")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTask(payload) {
  ensure();
  const { error } = await supabase.from("immersion_tasks").insert([payload]);
  if (error) throw error;
}

export async function updateTask(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_tasks").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id) {
  ensure();
  const { error } = await supabase.from("immersion_tasks").delete().eq("id", id);
  if (error) throw error;
}
