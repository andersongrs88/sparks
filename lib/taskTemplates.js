import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

export async function listActiveTaskTemplates() {
  ensure();
  const { data, error } = await supabase
    .from("task_templates")
    .select("id, phase, title, days_offset, area, suggested_owner, is_active")
    .eq("is_active", true)
    .order("phase", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
