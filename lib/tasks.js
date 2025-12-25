import { supabase } from "./supabaseClient";
import { getImmersion } from "./immersions";

// Evita erros quando o banco tem colunas diferentes (bases antigas/novas)
const TASK_COLUMNS_ALLOWLIST = new Set([
  "immersion_id",
  "phase",
  "area",
  "title",
  "responsible_id",
  "due_date",
  "status",
  "notes",
  // Auditoria (opcional; ignora se não existir no schema)
  "created_by",
  "completed_by",
  "completed_at",
  "evidence_link",
  "evidence_path",
  // Compat
  "done_at",
]);

function sanitizeTaskPayload(payload) {
  const out = {};
  Object.keys(payload || {}).forEach((k) => {
    if (TASK_COLUMNS_ALLOWLIST.has(k) && payload[k] !== undefined) out[k] = payload[k];
  });
  return out;
}

function addDays(dateISO, days) {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeDefaultsFromImmersion({ immersion, phase }) {
  const ph = (phase || "PA-PRE").toString().trim();

  // Responsável automático
  let responsible_id = null;
  if (ph === "POS") responsible_id = immersion?.instructional_designer || immersion?.educational_consultant || null;
  else responsible_id = immersion?.educational_consultant || immersion?.instructional_designer || null;

  // Prazo inteligente (heurística simples e previsível)
  // PA-PRE: -10 dias do início
  // DURANTE: início
  // POS: +3 dias do fim
  let due_date = null;
  if (immersion?.start_date && (ph === "PA-PRE" || ph === "DURANTE")) {
    due_date = ph === "PA-PRE" ? addDays(immersion.start_date, -10) : immersion.start_date;
  }
  if (immersion?.end_date && ph === "POS") {
    due_date = addDays(immersion.end_date, 3);
  }

  return { responsible_id, due_date };
}

async function enrichTaskPayload(payload) {
  const clean = sanitizeTaskPayload(payload || {});
  const immersionId = clean.immersion_id;
  if (!immersionId) return clean;

  // Só busca a imersão se precisar preencher algo
  const needsResponsible = !clean.responsible_id;
  const needsDue = !clean.due_date;
  if (!needsResponsible && !needsDue) return clean;

  const immersion = await getImmersion(immersionId);
  const { responsible_id, due_date } = computeDefaultsFromImmersion({ immersion, phase: clean.phase });

  return {
    ...clean,
    ...(needsResponsible ? { responsible_id } : null),
    ...(needsDue ? { due_date } : null),
  };
}

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listTasksByImmersion(immersionId) {
  ensure();
  const { data, error } = await supabase
    .from("immersion_tasks")
    .select("*")
    .eq("immersion_id", immersionId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTask(payload) {
  ensure();
  const enriched = await enrichTaskPayload(payload);
  const { data, error } = await supabase
    .from("immersion_tasks")
    .insert([enriched])
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// Marca tarefas como "Atrasada" quando passaram do prazo e ainda não foram concluídas.
// Best-effort: se o schema não aceitar, falha silenciosamente no caller.
export async function syncOverdueTasksForImmersion(immersionId) {
  ensure();
  if (!immersionId) return 0;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayISO = t0.toISOString().slice(0, 10);

  // Atualiza apenas tarefas ainda abertas
  const { data, error } = await supabase
    .from("immersion_tasks")
    .update({ status: "Atrasada" })
    .eq("immersion_id", immersionId)
    .neq("status", "Concluída")
    .neq("status", "Atrasada")
    .not("due_date", "is", null)
    .lt("due_date", todayISO)
    .select("id");

  if (error) throw error;
  return (data || []).length;
}

export async function syncOverdueTasksGlobal(limitImmersionIds = null) {
  ensure();
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayISO = t0.toISOString().slice(0, 10);

  let q = supabase
    .from("immersion_tasks")
    .update({ status: "Atrasada" })
    .neq("status", "Concluída")
    .neq("status", "Atrasada")
    .not("due_date", "is", null)
    .lt("due_date", todayISO);

  if (Array.isArray(limitImmersionIds) && limitImmersionIds.length > 0) {
    q = q.in("immersion_id", limitImmersionIds);
  }

  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data || []).length;
}

export async function createTasks(payloads) {
  ensure();
  if (!payloads || payloads.length === 0) return [];
  // Enriquecimento em lote (agrupa por imersão para reduzir chamadas)
  const groups = new Map();
  for (const p of payloads) {
    const clean = sanitizeTaskPayload(p || {});
    const key = clean.immersion_id || "__no_immersion__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(clean);
  }

  const enrichedAll = [];
  for (const [immersionId, items] of groups.entries()) {
    if (immersionId === "__no_immersion__") {
      enrichedAll.push(...items);
      continue;
    }
    let immersion = null;
    // Busca a imersão apenas se alguma task precisar de responsável/prazo
    const needs = items.some((it) => !it.responsible_id || !it.due_date);
    if (needs) immersion = await getImmersion(immersionId);

    for (const it of items) {
      const needsResponsible = !it.responsible_id;
      const needsDue = !it.due_date;
      if (!immersion || (!needsResponsible && !needsDue)) {
        enrichedAll.push(it);
        continue;
      }
      const { responsible_id, due_date } = computeDefaultsFromImmersion({ immersion, phase: it.phase });
      enrichedAll.push({
        ...it,
        ...(needsResponsible ? { responsible_id } : null),
        ...(needsDue ? { due_date } : null),
      });
    }
  }

  const { data, error } = await supabase.from("immersion_tasks").insert(enrichedAll).select("*");
  if (error) throw error;
  return data ?? [];
}

export async function updateTask(taskId, patch) {
  ensure();
  const clean = sanitizeTaskPayload(patch || {});
  const { data, error } = await supabase
    .from("immersion_tasks")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTask(taskId) {
  ensure();
  const { error } = await supabase.from("immersion_tasks").delete().eq("id", taskId);
  if (error) throw error;
  return true;
}

// ----------------------------
// Helpers
// ----------------------------
export function sortTasksByPriority(tasks) {
  const toTime = (d) => (d ? new Date(d).getTime() : null);

  return (tasks || []).slice().sort((a, b) => {
    const aDone = a?.status === "Concluída";
    const bDone = b?.status === "Concluída";
    if (aDone !== bDone) return aDone ? 1 : -1;

    const aDue = toTime(a?.due_date);
    const bDue = toTime(b?.due_date);
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue === null && bDue !== null) return 1;
    if (aDue !== null && bDue === null) return -1;

    const aUpd = toTime(a?.updated_at);
    const bUpd = toTime(b?.updated_at);
    if (aUpd !== null && bUpd !== null && aUpd !== bUpd) return bUpd - aUpd;

    const aCr = toTime(a?.created_at) || 0;
    const bCr = toTime(b?.created_at) || 0;
    return aCr - bCr;
  });
}
