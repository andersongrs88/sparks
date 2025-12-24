import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
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
  const { data, error } = await supabase
    .from("immersion_tasks")
    .insert([payload])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createTasks(payloads) {
  ensure();
  if (!payloads || payloads.length === 0) return [];
  const { data, error } = await supabase.from("immersion_tasks").insert(payloads).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function updateTask(taskId, patch) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(taskId) {
  ensure();
  const { error } = await supabase.from("immersion_tasks").delete().eq("id", taskId);
  if (error) throw error;
  return true;
}

// ----------------------------
// Helpers
// ----------------------------
export function sortTasksByPriority(tasks) {
  const toTime = (d) => (d ? new Date(d).getTime() : null);

  return (tasks || []).slice().sort((a, b) => {
    const aDone = a?.status === "Concluída";
    const bDone = b?.status === "Concluída";
    if (aDone !== bDone) return aDone ? 1 : -1;

    const aDue = toTime(a?.due_date);
    const bDue = toTime(b?.due_date);
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue === null && bDue !== null) return 1;
    if (aDue !== null && bDue === null) return -1;

    const aUpd = toTime(a?.updated_at);
    const bUpd = toTime(b?.updated_at);
    if (aUpd !== null && bUpd !== null && aUpd !== bUpd) return bUpd - aUpd;

    const aCr = toTime(a?.created_at) || 0;
    const bCr = toTime(b?.created_at) || 0;
    return aCr - bCr;
  });
}
