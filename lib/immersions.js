import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listImmersions() {
  ensure();
  const { data, error } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, room_location, status, created_at")
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getImmersion(id) {
  ensure();
  const { data, error } = await supabase
    .from("immersions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function createImmersion(payload) {
  ensure();
  // Defensive mapping: keep the app compatible with older DB schemas and older UI payloads.
  // - Some deployments used `room` instead of `room_location`
  // - Some deployments used `immersion_type` instead of `type`
  // - Some screens used `format` as UI name for `type`
  const normalized = {
    ...payload,
    room_location: payload.room_location ?? payload.room,
    type: payload.type ?? payload.immersion_type ?? payload.format,
  };

  // Allowlist to avoid inserting unknown columns (prevents "schema cache" errors).
  const allowed = [
    "immersion_name",
    "type",
    "start_date",
    "end_date",
    "room_location",
    "status",
    "educational_consultant",
    "instructional_designer",
    "mentors_present",
    "need_specific_staff",
    "staff_justification",
    "service_order_link",
    "technical_sheet_link",
  ];

  const safePayload = Object.fromEntries(
    Object.entries(normalized).filter(([k, v]) => allowed.includes(k) && v !== undefined)
  );

  const { data, error } = await supabase
    .from("immersions")
    .insert([safePayload])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateImmersion(id, payload) {
  ensure();
  const { error } = await supabase
    .from("immersions")
    .update(payload)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteImmersion(id) {
  ensure();
  const { error } = await supabase
    .from("immersions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
