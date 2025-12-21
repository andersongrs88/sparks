import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no Netlify).");
}

export async function listActiveProfiles() {
  ensure();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_active")
    .eq("is_active", true)
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
