import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy). ");
}

export async function listScheduleByImmersion(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_schedule")
    .select("id, immersion_id, topic, responsible_profile_id, start_time, duration_minutes, notes, created_at")
    .eq("immersion_id", immersionId)
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createScheduleItem(payload) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_schedule")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

export async function updateScheduleItem(id, patch) {
  ensure();
  const { error } = await supabase
    .from("immersion_schedule")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function deleteScheduleItem(id) {
  ensure();
  const { error } = await supabase
    .from("immersion_schedule")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}
