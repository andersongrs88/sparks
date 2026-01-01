import { adminFetch } from "./adminFetch";

export async function getSpeakerRider(speakerId) {
  const id = String(speakerId || "").trim();
  if (!id) throw new Error("speakerId inválido.");
  const out = await adminFetch(`/api/admin/speakers/${encodeURIComponent(id)}/rider`, { method: "GET" });
  return out?.data || null;
}

export async function saveSpeakerRider(speakerId, payload) {
  const id = String(speakerId || "").trim();
  if (!id) throw new Error("speakerId inválido.");
  await adminFetch(`/api/admin/speakers/${encodeURIComponent(id)}/rider`, { method: "PUT", body: payload });
}
