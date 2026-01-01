import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listVideos(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_videos")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("title", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createVideo(payload) {
  ensure();
  const { error } = await supabase.from("immersion_videos").insert([payload]);
  if (error) throw error;
}

export async function updateVideo(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_videos").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteVideo(id) {
  ensure();
  const { error } = await supabase.from("immersion_videos").delete().eq("id", id);
  if (error) throw error;
}
