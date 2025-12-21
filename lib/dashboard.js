import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function listImmersionsForDashboard() {
  ensure();
  const { data, error } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, room_location, status")
    .order("start_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listLateTasksForDashboard() {
  ensure();

  // Busca tasks + informações básicas da imersão
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, phase, immersion_id, owner_profile_id, immersions(id, immersion_name, start_date)")
    .neq("status", "Concluída")
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listProfilesForDashboard() {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("is_active", true);

  if (error) throw error;
  return data ?? [];
}
