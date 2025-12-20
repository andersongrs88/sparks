import { supabase } from "./supabaseClient";

export async function listImmersions() {
  const { data, error } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, room_location, status, created_at")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createImmersion(payload) {
  const { error } = await supabase.from("immersions").insert([payload]);
  if (error) throw error;
}
