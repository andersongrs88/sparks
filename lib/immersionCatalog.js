import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export const IMMERSION_FORMATS = [
  { value: "presencial", label: "Presencial" },
  { value: "onlive", label: "Onlive" },
  { value: "zoom", label: "Zoom" },
  { value: "entrada", label: "Entrada" },
  { value: "giants", label: "Giants" },
  { value: "incompany", label: "Incompany" },
  { value: "outros", label: "Outros" }
];

export async function listImmersionCatalog() {
  ensure();
  const { data, error } = await supabase
    .from("immersion_catalog")
    .select("id, name, format, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createImmersionCatalog({ name, format, is_active } = {}) {
  ensure();
  const payload = {
    name: String(name || "").trim(),
    format,
    is_active: !!is_active
  };
  if (!payload.name) throw new Error("Nome da imersão é obrigatório.");
  if (!payload.format) throw new Error("Formato é obrigatório.");
  const { data, error } = await supabase
    .from("immersion_catalog")
    .insert(payload)
    .select("id, name, format, is_active, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateImmersionCatalog(id, patch = {}) {
  ensure();
  const payload = {};
  if (patch.name !== undefined) payload.name = String(patch.name || "").trim();
  if (patch.format !== undefined) payload.format = patch.format;
  if (patch.is_active !== undefined) payload.is_active = !!patch.is_active;

  const { data, error } = await supabase
    .from("immersion_catalog")
    .update(payload)
    .eq("id", id)
    .select("id, name, format, is_active, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteImmersionCatalog(id) {
  ensure();
  const { error } = await supabase.from("immersion_catalog").delete().eq("id", id);
  if (error) throw error;
  return true;
}
