import { supabase } from "./supabaseClient";

async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function adminFetch(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão inválida. Faça login novamente.");

  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error || `Falha na requisição (${res.status}).`;
    throw new Error(msg);
  }
  return payload;
}
