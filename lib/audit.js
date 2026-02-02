import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listAuditByImmersion(immersionId, { limit = 100 } = {}) {
  ensure();
  if (!immersionId) return [];

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, immersion_id, table_name, action, actor_id, record_id, changes")
    .eq("immersion_id", immersionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
