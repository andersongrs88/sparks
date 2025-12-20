import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no Netlify).");
}

export async function listImmersions() {
  ensure();
  const { data, error } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, room_location, status, created_at")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createImmersion(payload) {
  ensure();
  const { error } = await supabase.from("immersions").insert([payload]);
  if (error) throw error;
}
