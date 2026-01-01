import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listTools(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_tools")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTool(payload) {
  ensure();
  const { error } = await supabase.from("immersion_tools").insert([payload]);
  if (error) throw error;
}

export async function updateTool(id, payload) {
  ensure();
  const { error } = await supabase.from("immersion_tools").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteTool(id) {
  ensure();
  const { error } = await supabase.from("immersion_tools").delete().eq("id", id);
  if (error) throw error;
}
