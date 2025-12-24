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
  const { error } = await supabase.from("immersion_tasks").insert([payload]);
  if (error) throw error;
}

export async function createTasks(payloads) {
  ensure();
  const list = Array.isArray(payloads) ? payloads : [];
  if (list.length === 0) return;
  const { error } = await supabase.from("immersion_tasks").insert(list);
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


// Ordena tarefas por prioridade operacional:
// 1) Atrasadas (due_date no passado e não concluídas)
// 2) Próximas por data (due_date mais cedo)
// 3) Sem prazo (por último)
// 4) Desempate por updated_at/created_at
export function sortTasksByPriority(list) {
  const now = Date.now();
  return [...(list || [])].sort((a, b) => {
    const aDone = a?.status === "Concluída";
    const bDone = b?.status === "Concluída";

    const aDue = a?.due_date ? new Date(a.due_date).getTime() : null;
    const bDue = b?.due_date ? new Date(b.due_date).getTime() : null;

    const aOver = !aDone && aDue !== null && aDue < now;
    const bOver = !bDone && bDue !== null && bDue < now;

    if (aOver !== bOver) return aOver ? -1 : 1;

    // Se ambos têm prazo, ordenar pelo mais próximo
    if (aDue !== null && bDue !== null) {
      if (aDue !== bDue) return aDue - bDue;
    } else if (aDue === null && bDue !== null) {
      return 1;
    } else if (aDue !== null && bDue === null) {
      return -1;
    }

    const aUpd = a?.updated_at ? new Date(a.updated_at).getTime() : null;
    const bUpd = b?.updated_at ? new Date(b.updated_at).getTime() : null;
    if (aUpd !== null && bUpd !== null && aUpd !== bUpd) return bUpd - aUpd;

    const aCr = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCr = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return aCr - bCr;
  });
}

