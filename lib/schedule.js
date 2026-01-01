import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listScheduleItems(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_schedule_items")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("day_date", { ascending: true, nullsFirst: true })
    .order("day_label", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createScheduleItem(payload) {
  ensure();
  const { error } = await supabase.from("immersion_schedule_items").insert([payload]);
  if (error) throw error;
}

export async function updateScheduleItem(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_schedule_items").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteScheduleItem(id) {
  ensure();
  const { error } = await supabase.from("immersion_schedule_items").delete().eq("id", id);
  if (error) throw error;
}
