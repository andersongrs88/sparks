import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listImmersions() {
  ensure();

  // Cache curto em memória para navegação rápida (voltar/avançar) — importante em mobile.
  // Evita refetch contínuo quando usuário alterna entre Dashboard/Imersões.
  if (typeof window !== "undefined") {
    try {
      const cached = window.__sparksImmersionsCache;
      if (cached?.ts && (Date.now() - cached.ts < 30 * 1000) && Array.isArray(cached.value)) {
        return cached.value;
      }
    } catch {}
  }
  const { data, error } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, room_location, status, created_at, educational_consultant, instructional_designer")
    .order("start_date", { ascending: false });

  if (error) throw error;
  const immersions = data ?? [];

  // Próxima ação por imersão: menor prazo dentre tarefas abertas (fallback: primeira tarefa aberta).
  // Fazemos em uma consulta única para manter o app leve no deploy (Vercel/Supabase).
  try {
    const ids = immersions.map((i) => i.id).filter(Boolean);
    if (ids.length) {
      const { data: tasks, error: te } = await supabase
        .from("immersion_tasks")
        .select("id, immersion_id, title, status, due_date, done_at, phase")
        .in("immersion_id", ids)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(5000);
      if (te) throw te;

      const nextByImm = new Map();
      for (const t of tasks || []) {
        if (t.status === "Concluída" || t.status === "Concluida" || !!t.done_at) continue;
        const current = nextByImm.get(t.immersion_id);
        if (!current) {
          nextByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
          continue;
        }
        const due = t.due_date ? new Date(t.due_date + "T00:00:00") : null;
        const curDue = current.due_date ? new Date(current.due_date + "T00:00:00") : null;
        if (due && (!curDue || due.getTime() < curDue.getTime())) {
          nextByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
        }
      }

      const result = immersions.map((i) => ({ ...i, next_action: nextByImm.get(i.id) || null }));
      if (typeof window !== "undefined") {
        try { window.__sparksImmersionsCache = { ts: Date.now(), value: result }; } catch {}
      }
      return result;
    }
  } catch {
    // Se a base não tiver a tabela/colunas, retornamos sem próxima ação.
  }

  if (typeof window !== "undefined") {
    try { window.__sparksImmersionsCache = { ts: Date.now(), value: immersions }; } catch {}
  }
  return immersions;
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
    "immersion_catalog_id",
    "type",
    "start_date",
    "end_date",
    "room_location",
    "status",
    "educational_consultant",
    "instructional_designer",
    "production_responsible",
    "events_responsible",
    // Dono do checklist (regra: sempre igual ao consultor)
    "checklist_owner_id",
    // Palestrantes
    "trainer_speaker_id",
    "speaker_ids",
    "checklist_template_id",
    "mentors_present",
    "need_specific_staff",
    "staff_justification",
    "service_order_link",
    "technical_sheet_link",
  ];

  const safePayload = Object.fromEntries(
    Object.entries(normalized).filter(([k, v]) => allowed.includes(k) && v !== undefined)
  );

  // Regra de negócio: "Dono" sempre será o Consultor selecionado.
  if (safePayload.educational_consultant) {
    safePayload.checklist_owner_id = safePayload.educational_consultant;
  }

  // Robustness: if a deployment is missing a column (PostgREST schema cache), drop it and retry.
  // This prevents the UI from breaking when DB migrations are rolling out.
  let attempt = 0;
  let working = { ...safePayload };
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("immersions")
      .insert([working])
      .select("*")
      .single();

    if (!error) return data;

    const msg = String(error?.message || "");
    const m = msg.match(/Could not find the '([^']+)' column of 'immersions'/i);
    if (m && m[1] && Object.prototype.hasOwnProperty.call(working, m[1]) && attempt < 6) {
      const missing = m[1];
      delete working[missing];
      attempt += 1;
      continue;
    }
    throw error;
  }
}

export async function updateImmersion(id, payload) {
  ensure();

  // Regra de negócio: imersões concluídas ficam bloqueadas para edição.
  // (Permite a transição PARA "Concluída", mas impede qualquer alteração DEPOIS disso.)
  const { data: current, error: curErr } = await supabase
    .from("immersions")
    .select("status")
    .eq("id", id)
    .single();

  if (curErr) throw curErr;

  if (current?.status === "Concluída") {
    const err = new Error("Esta imersão está Concluída e não pode mais ser editada.");
    // padrão semelhante ao PostgREST para facilitar handling no front
    err.code = "IMMERSION_LOCKED";
    throw err;
  }

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


// =====================
// IMMERSION CATALOG (public.immersion_catalog)
// Cadastro mestre para padronização de Nome/Formato (não é "edição" de imersão).
// Expected columns: id, name, format, is_active, created_at
// =====================
export async function listImmersionCatalog({ onlyActive = true } = {}) {
  ensure();
  let q = supabase
    .from("immersion_catalog")
    .select("id, name, format, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .order("format", { ascending: true });

  if (onlyActive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
