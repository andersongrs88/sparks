import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado.");
}

function getBearer() {
  const s = supabase?.auth?.session?.();
  const token = s?.access_token;
  if (!token) throw new Error("Sessão inválida (faça login novamente).");
  return token;
}

async function request(path, { method = "GET", body } = {}) {
  ensure();
  const token = getBearer();
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Falha na requisição.");
  return data;
}

export async function loadEmailNotificationConfig() {
  return request("/api/admin/email-notification-config");
}

export async function saveEmailNotificationConfig(payload) {
  return request("/api/admin/email-notification-config", { method: "POST", body: payload });
}
