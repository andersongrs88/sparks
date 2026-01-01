import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel)." );
}

function sanitizeFilename(name) {
  return String(name || "arquivo")
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function uploadEvidenceFile({ file, immersionId, taskId }) {
  ensure();
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  if (!immersionId || !taskId) throw new Error("Imersão/tarefa inválidas.");

  const filename = sanitizeFilename(file.name);
  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${immersionId}/${taskId}/${stamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("evidences")
    .upload(path, file, { upsert: true, cacheControl: "3600" });

  if (uploadError) throw uploadError;

  return { path };
}

export async function createEvidenceSignedUrl(path, expiresInSeconds = 3600) {
  ensure();
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("evidences")
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl || null;
}
