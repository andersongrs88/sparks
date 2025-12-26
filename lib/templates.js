import { supabase } from "./supabaseClient";
import { createTasks } from "./tasks";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique variáveis no deploy).");
}

function normType(t) {
  const v = (t || "").trim();
  return v ? v : null;
}

function normStatus(v) {
  const s = (v || "").toLowerCase().trim();
  if (s === "published" || s === "publicado") return "published";
  if (s === "draft" || s === "rascunho") return "draft";
  return null;
}

// =====================
// TASK TEMPLATES (public.task_templates)
// Expected columns: id, title, phase, immersion_type (nullable), sort_order (optional)
// =====================
export async function listTaskTemplates({ immersionType = null } = {}) {
  ensure();
  const t = normType(immersionType);

  let q = supabase
    .from("task_templates")
    .select("*")
    .order("phase", { ascending: true })
    .order("title", { ascending: true });

  // Prefer templates specific to the type AND global (null)
  if (t) q = q.or(`immersion_type.eq.${t},immersion_type.is.null`);

  const { data, error } = await q;
  if (error) throw error;

  // If no type filter, return all
  if (!t) return data ?? [];

  // De-duplicate by (phase,title), prefer type-specific over global
  const map = new Map();
  for (const row of data || []) {
    const k = `${row.phase || ""}::${(row.title || "").trim().toLowerCase()}`;
    const existing = map.get(k);
    if (!existing) {
      map.set(k, row);
      continue;
    }
    // Prefer exact match over null
    if (existing.immersion_type == null && row.immersion_type === t) map.set(k, row);
  }
  return Array.from(map.values());
}

export async function createTaskTemplate(payload) {
  ensure();
  const clean = {
    title: payload.title?.trim(),
    phase: payload.phase,
    immersion_type: normType(payload.immersion_type),
    status: normStatus(payload.status) || "draft",
    version: Number.isFinite(payload.version) ? payload.version : 1,
    published_at: null,
  };
  const { error } = await supabase.from("task_templates").insert([clean]);
  if (error) throw error;
}

export async function deleteTaskTemplate(id) {
  ensure();
  const { error } = await supabase.from("task_templates").delete().eq("id", id);
  if (error) throw error;
}

// =====================
// SCHEDULE TEMPLATES (public.immersion_schedule_templates)
// Expected columns: id, immersion_type (nullable), day_index (int), start_time, end_time, title, notes, sort_order
// =====================
export async function listScheduleTemplates({ immersionType = null } = {}) {
  ensure();
  const t = normType(immersionType);
  let q = supabase
    .from("immersion_schedule_templates")
    .select("*")
    .order("day_index", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });
  if (t) q = q.or(`immersion_type.eq.${t},immersion_type.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createScheduleTemplate(payload) {
  ensure();
  const clean = {
    immersion_type: normType(payload.immersion_type),
    day_index: Number.isFinite(payload.day_index) ? payload.day_index : 1,
    day_label: payload.day_label || null,
    start_time: payload.start_time || null,
    end_time: payload.end_time || null,
    title: payload.title?.trim(),
    notes: payload.notes || null,
    sort_order: payload.sort_order ?? 0,
    status: normStatus(payload.status) || "draft",
    version: Number.isFinite(payload.version) ? payload.version : 1,
    published_at: null,
  };
  const { error } = await supabase.from("immersion_schedule_templates").insert([clean]);
  if (error) throw error;
}

export async function deleteScheduleTemplate(id) {
  ensure();
  const { error } = await supabase.from("immersion_schedule_templates").delete().eq("id", id);
  if (error) throw error;
}

// =====================
// MATERIAL TEMPLATES (public.immersion_material_templates)
// Expected columns: id, immersion_type (nullable), name, link, notes, sort_order
// =====================
export async function listMaterialTemplates({ immersionType = null } = {}) {
  ensure();
  const t = normType(immersionType);
  let q = supabase
    .from("immersion_material_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (t) q = q.or(`immersion_type.eq.${t},immersion_type.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createMaterialTemplate(payload) {
  ensure();
  const clean = {
    immersion_type: normType(payload.immersion_type),
    name: payload.name?.trim(),
    link: payload.link || null,
    notes: payload.notes || null,
    sort_order: payload.sort_order ?? 0,
    status: normStatus(payload.status) || "draft",
    version: Number.isFinite(payload.version) ? payload.version : 1,
    published_at: null,
  };
  const { error } = await supabase.from("immersion_material_templates").insert([clean]);
  if (error) throw error;
}

export async function deleteMaterialTemplate(id) {
  ensure();
  const { error } = await supabase.from("immersion_material_templates").delete().eq("id", id);
  if (error) throw error;
}

// =====================
// TOOL TEMPLATES (public.immersion_tool_templates)
// Expected columns: id, immersion_type (nullable), name, link, print_guidance, print_quantity, sort_order
// =====================
export async function listToolTemplates({ immersionType = null } = {}) {
  ensure();
  const t = normType(immersionType);
  let q = supabase
    .from("immersion_tool_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (t) q = q.or(`immersion_type.eq.${t},immersion_type.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createToolTemplate(payload) {
  ensure();
  const clean = {
    immersion_type: normType(payload.immersion_type),
    name: payload.name?.trim(),
    link: payload.link || null,
    print_guidance: payload.print_guidance || null,
    print_quantity: payload.print_quantity ?? null,
    sort_order: payload.sort_order ?? 0,
    status: normStatus(payload.status) || "draft",
    version: Number.isFinite(payload.version) ? payload.version : 1,
    published_at: null,
  };
  const { error } = await supabase.from("immersion_tool_templates").insert([clean]);
  if (error) throw error;
}

export async function deleteToolTemplate(id) {
  ensure();
  const { error } = await supabase.from("immersion_tool_templates").delete().eq("id", id);
  if (error) throw error;
}

// =====================
// VIDEO TEMPLATES (public.immersion_video_templates)
// Expected columns: id, immersion_type (nullable), title, when_to_use, link, area, sort_order
// =====================
export async function listVideoTemplates({ immersionType = null } = {}) {
  ensure();
  const t = normType(immersionType);
  let q = supabase
    .from("immersion_video_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (t) q = q.or(`immersion_type.eq.${t},immersion_type.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createVideoTemplate(payload) {
  ensure();
  const clean = {
    immersion_type: normType(payload.immersion_type),
    title: payload.title?.trim(),
    when_to_use: payload.when_to_use || null,
    link: payload.link || null,
    area: payload.area || null,
    sort_order: payload.sort_order ?? 0,
    status: normStatus(payload.status) || "draft",
    version: Number.isFinite(payload.version) ? payload.version : 1,
    published_at: null,
  };
  const { error } = await supabase.from("immersion_video_templates").insert([clean]);
  if (error) throw error;
}

export async function deleteVideoTemplate(id) {
  ensure();
  const { error } = await supabase.from("immersion_video_templates").delete().eq("id", id);
  if (error) throw error;
}

// =====================
// LOAD TEMPLATES INTO A NEW IMMERSION
// Inserts tasks via createTasks() (so your owner/date rules apply)
// Inserts schedule/material/tool/video via direct inserts
// =====================
export async function applyTemplatesForType({
  immersionId,
  immersionType,
  startDate,
  endDate,
  include = { tasks: true, schedule: true, materials: true, tools: true, videos: true },
}) {
  ensure();
  const type = normType(immersionType);

  if (!immersionId) throw new Error("immersionId é obrigatório.");

  // 1) Tasks
  if (include.tasks) {
    const tasks = await listTaskTemplates({ immersionType: type });
    const rows = (tasks || []).map((t) => ({
      immersion_id: immersionId,
      title: t.title,
      phase: t.phase,
      status: "pending",
    }));
    if (rows.length) await createTasks(rows);
  }

  // Helpers for date math (schedule)
  function addDays(dateISO, days) {
    if (!dateISO) return null;
    const d = new Date(dateISO + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // 2) Schedule
  if (include.schedule) {
    const schedule = await listScheduleTemplates({ immersionType: type });
    const payload = (schedule || []).map((s) => {
      const dayIndex = Number.isFinite(s.day_index) ? s.day_index : 1;
      const dayLabel = s.day_label || `Dia ${dayIndex}`;
      const dayDate = startDate ? addDays(startDate, Math.max(0, dayIndex - 1)) : null;
      return {
        immersion_id: immersionId,
        day_index: dayIndex,
        day_label: dayLabel,
        day_date: dayDate,
        start_time: s.start_time ?? null,
        end_time: s.end_time ?? null,
        title: s.title,
        notes: s.notes ?? null,
        sort_order: s.sort_order ?? 0,
      };
    });
    if (payload.length) {
      const { error } = await supabase.from("immersion_schedule_items").insert(payload);
      if (error) throw error;
    }
  }

  // 3) Materials
  if (include.materials) {
    const mats = await listMaterialTemplates({ immersionType: type });
    const payload = (mats || []).map((m) => ({
      immersion_id: immersionId,
      name: m.name,
      link: m.link ?? null,
      notes: m.notes ?? null,
      sort_order: m.sort_order ?? 0,
    }));
    if (payload.length) {
      const { error } = await supabase.from("immersion_materials").insert(payload);
      if (error) throw error;
    }
  }

  // 4) Tools
  if (include.tools) {
    const tools = await listToolTemplates({ immersionType: type });
    const payload = (tools || []).map((t) => ({
      immersion_id: immersionId,
      name: t.name,
      link: t.link ?? null,
      print_guidance: t.print_guidance ?? null,
      print_quantity: t.print_quantity ?? null,
      sort_order: t.sort_order ?? 0,
    }));
    if (payload.length) {
      const { error } = await supabase.from("immersion_tools").insert(payload);
      if (error) throw error;
    }
  }

  // 5) Videos
  if (include.videos) {
    const videos = await listVideoTemplates({ immersionType: type });
    const payload = (videos || []).map((v) => ({
      immersion_id: immersionId,
      title: v.title,
      when_to_use: v.when_to_use ?? null,
      link: v.link ?? null,
      area: v.area ?? null,
      sort_order: v.sort_order ?? 0,
    }));
    if (payload.length) {
      const { error } = await supabase.from("immersion_videos").insert(payload);
      if (error) throw error;
    }
  }

  // end
  return true;
}

// =====================
// APPLY TEMPLATES INTO AN IMMERSION
// =====================

function addDays(dateISO, days) {
  if (!dateISO) return null;
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Apply type templates into an immersion.
 * Best-effort: if a table is missing (schema not migrated), it will skip that module.
 */
export async function applyTypeTemplates({
  immersionId,
  immersionType,
  startDate,
  endDate,
  include = { tasks: true, schedule: true, materials: true, tools: true, videos: true },
} = {}) {
  ensure();
  if (!immersionId) throw new Error("immersionId é obrigatório.");

  const type = normType(immersionType);

  // 1) Tasks
  if (include.tasks) {
    try {
      const tpls = await listTaskTemplates({ immersionType: type });
      const { data: existingTasks, error: exErr } = await supabase
        .from("immersion_tasks")
        .select("title,phase")
        .eq("immersion_id", immersionId);
      if (exErr) throw exErr;
      const existingTaskKeys = new Set((existingTasks || []).map((t) => `${(t.phase || "").trim()}::${(t.title || "").trim().toLowerCase()}`));
      const rows = (tpls || []).map((t) => ({
        immersion_id: immersionId,
        title: t.title,
        phase: t.phase,
        status: "pending",
      })).filter((r) => !existingTaskKeys.has(`${(r.phase || "").trim()}::${(r.title || "").trim().toLowerCase()}`));
      if (rows.length) await createTasks(rows);
    } catch (e) {
      // Skip if table/columns not present
      if (!String(e?.message || "").toLowerCase().includes("does not exist")) {
        // surface unexpected errors
        throw e;
      }
    }
  }

  // 2) Schedule
  if (include.schedule) {
    try {
      const { data, error } = await supabase
        .from("immersion_schedule_templates")
        .select("*")
        .or(type ? `immersion_type.eq.${type},immersion_type.is.null` : "")
        .order("day_index", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true });
      if (error) throw error;

      const { data: existingSchedule, error: exSchErr } = await supabase
        .from("immersion_schedule_items")
        .select("day_index,title,start_time")
        .eq("immersion_id", immersionId);
      if (exSchErr) throw exSchErr;
      const existingScheduleKeys = new Set((existingSchedule || []).map((it) => `${it.day_index||""}::${(it.title||"").trim().toLowerCase()}::${it.start_time||""}`));

      const mapped = (data || []).map((s) => {
        const dayIndex = Number.isFinite(s.day_index) ? s.day_index : 1;
        const dayDate = startDate ? addDays(startDate, Math.max(0, dayIndex - 1)) : null;
        return {
          immersion_id: immersionId,
          day_index: dayIndex,
          day_label: s.day_label || (dayIndex ? `Dia ${dayIndex}` : null),
          day_date: dayDate,
          start_time: s.start_time || null,
          end_time: s.end_time || null,
          title: s.title,
          notes: s.notes || null,
          sort_order: s.sort_order ?? 0,
        };
      });

      const filtered = (mapped || []).filter((m) => !existingScheduleKeys.has(`${m.day_index||""}::${(m.title||"").trim().toLowerCase()}::${m.start_time||""}`));

      if (filtered.length) {
        const { error: insErr } = await supabase.from("immersion_schedule_items").insert(filtered);
        if (insErr) throw insErr;
      }
    } catch (e) {
      if (!String(e?.message || "").toLowerCase().includes("does not exist")) throw e;
    }
  }

  // 3) Materials
  if (include.materials) {
    try {
      const { data, error } = await supabase
        .from("immersion_material_templates")
        .select("*")
        .or(type ? `immersion_type.eq.${type},immersion_type.is.null` : "")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;

      const { data: existingMaterials, error: exMatErr } = await supabase
        .from("immersion_materials")
        .select("name")
        .eq("immersion_id", immersionId);
      if (exMatErr) throw exMatErr;
      const existingMaterialNames = new Set((existingMaterials || []).map((it) => (it.name||"").trim().toLowerCase()));

      const mapped = (data || []).map((m) => ({
        immersion_id: immersionId,
        name: m.name,
        link: m.link || null,
        notes: m.notes || null,
        sort_order: m.sort_order ?? 0,
      }));

      const filtered = (mapped || []).filter((m) => !existingMaterialNames.has((m.name||"").trim().toLowerCase()));

      if (filtered.length) {
        const { error: insErr } = await supabase.from("immersion_materials").insert(filtered);
        if (insErr) throw insErr;
      }
    } catch (e) {
      if (!String(e?.message || "").toLowerCase().includes("does not exist")) throw e;
    }
  }

  // 4) Tools
  if (include.tools) {
    try {
      const { data, error } = await supabase
        .from("immersion_tool_templates")
        .select("*")
        .or(type ? `immersion_type.eq.${type},immersion_type.is.null` : "")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;

      const { data: existingTools, error: exToolErr } = await supabase
        .from("immersion_tools")
        .select("name")
        .eq("immersion_id", immersionId);
      if (exToolErr) throw exToolErr;
      const existingToolNames = new Set((existingTools || []).map((it) => (it.name||"").trim().toLowerCase()));

      const mapped = (data || []).map((t) => ({
        immersion_id: immersionId,
        name: t.name,
        link: t.link || null,
        print_guidance: t.print_guidance || null,
        print_quantity: t.print_quantity ?? null,
        sort_order: t.sort_order ?? 0,
      }));

      const filtered = (mapped || []).filter((m) => !existingToolNames.has((m.name||"").trim().toLowerCase()));

      if (filtered.length) {
        const { error: insErr } = await supabase.from("immersion_tools").insert(filtered);
        if (insErr) throw insErr;
      }
    } catch (e) {
      if (!String(e?.message || "").toLowerCase().includes("does not exist")) throw e;
    }
  }

  // 5) Videos
  if (include.videos) {
    try {
      const { data, error } = await supabase
        .from("immersion_video_templates")
        .select("*")
        .or(type ? `immersion_type.eq.${type},immersion_type.is.null` : "")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;

      const { data: existingVideos, error: exVidErr } = await supabase
        .from("immersion_videos")
        .select("title")
        .eq("immersion_id", immersionId);
      if (exVidErr) throw exVidErr;
      const existingVideoTitles = new Set((existingVideos || []).map((it) => (it.title||"").trim().toLowerCase()));

      const mapped = (data || []).map((v) => ({
        immersion_id: immersionId,
        title: v.title,
        when_to_use: v.when_to_use || null,
        link: v.link || null,
        area: v.area || null,
        sort_order: v.sort_order ?? 0,
      }));

      const filtered = (mapped || []).filter((m) => !existingVideoTitles.has((m.title||"").trim().toLowerCase()));

      if (filtered.length) {
        const { error: insErr } = await supabase.from("immersion_videos").insert(filtered);
        if (insErr) throw insErr;
      }
    } catch (e) {
      if (!String(e?.message || "").toLowerCase().includes("does not exist")) throw e;
    }
  }

  // Optional: If endDate is provided but schedule uses day_date, nothing else.
  return true;
}


// =====================
// VERSIONING / PUBLISHING HELPERS
// =====================

const TEMPLATE_TABLES = {
  tasks: "task_templates",
  schedule: "immersion_schedule_templates",
  materials: "immersion_material_templates",
  tools: "immersion_tool_templates",
  videos: "immersion_video_templates",
};

function tableFor(kind) {
  const t = TEMPLATE_TABLES[kind];
  if (!t) throw new Error("Tipo de template inválido.");
  return t;
}

export async function publishTemplate(kind, id) {
  ensure();
  const table = tableFor(kind);
  const patch = { status: "published", published_at: new Date().toISOString() };
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
  return true;
}

export async function unpublishTemplate(kind, id) {
  ensure();
  const table = tableFor(kind);
  const patch = { status: "draft", published_at: null };
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
  return true;
}

export async function duplicateTemplate(kind, id) {
  ensure();
  const table = tableFor(kind);
  const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
  if (error) throw error;
  const copy = { ...data };
  delete copy.id;
  copy.status = "draft";
  copy.published_at = null;
  copy.version = (Number.isFinite(copy.version) ? copy.version : 1) + 1;
  copy.created_at = new Date().toISOString();
  const { error: insErr } = await supabase.from(table).insert([copy]);
  if (insErr) throw insErr;
  return true;
}
// -----------------------------------------------------------------------------
// Compatibilidade (legado)
// Algumas telas antigas importam funções que não fazem parte do schema atual.
// Mantemos stubs para evitar falha de build/import. Ajuste a tela conforme necessário.
// -----------------------------------------------------------------------------

export async function listTemplates() {
  // Prefer server-side endpoint (bypasses RLS and is consistent)
  try {
    const { adminFetch } = await import("./adminFetch");
    const out = await adminFetch("/api/admin/checklist-templates", { method: "GET" });
    return out?.data || [];
  } catch (_) {
    ensure();
    const { data, error } = await supabase
      .from("checklist_templates")
      .select("id, name, description, is_active, created_at")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}

export async function listTemplateItems(_templateId) {
  const templateId = String(_templateId || "").trim();
  if (!templateId) return [];
  try {
    const { adminFetch } = await import("./adminFetch");
    const out = await adminFetch(`/api/admin/checklist-template-items?template_id=${encodeURIComponent(templateId)}`, { method: "GET" });
    return out?.data || [];
  } catch (_) {
    ensure();
    const { data, error } = await supabase
      .from("checklist_template_items")
      .select("id, template_id, phase, area, title, due_basis, offset_days, sort_order, created_at")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("phase", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}

export async function createTemplate(_payload) {
  const payload = {
    name: String(_payload?.name || "").trim(),
    description: String(_payload?.description || "").trim() || null,
    is_active: _payload?.is_active === false ? false : true,
  };
  if (!payload.name) throw new Error("Nome do template é obrigatório.");
  try {
    const { adminFetch } = await import("./adminFetch");
    const out = await adminFetch("/api/admin/checklist-templates", { method: "POST", body: payload });
    return { id: out?.id };
  } catch (_) {
    ensure();
    const { data, error } = await supabase
      .from("checklist_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }
}

export async function updateTemplate(_id, _payload) {
  const id = String(_id || "").trim();
  if (!id) return;
  const payload = {
    ...("name" in (_payload || {}) ? { name: String(_payload?.name || "").trim() } : {}),
    ...("description" in (_payload || {}) ? { description: String(_payload?.description || "").trim() || null } : {}),
    ...("is_active" in (_payload || {}) ? { is_active: _payload?.is_active === false ? false : true } : {}),
  };
  if (payload.name !== undefined && !payload.name) throw new Error("Nome do template é obrigatório.");

  try {
    const { adminFetch } = await import("./adminFetch");
    await adminFetch(`/api/admin/checklist-templates/${id}`, { method: "PATCH", body: payload });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("checklist_templates").update(payload).eq("id", id);
    if (error) throw error;
  }
}

export async function deleteTemplate(_id) {
  const id = String(_id || "").trim();
  if (!id) return;
  try {
    const { adminFetch } = await import("./adminFetch");
    await adminFetch(`/api/admin/checklist-templates/${id}`, { method: "DELETE" });
    return;
  } catch (_) {
    ensure();
    // Safety: delete items first (even though FK cascade may exist)
    await supabase.from("checklist_template_items").delete().eq("template_id", id);
    const { error } = await supabase.from("checklist_templates").delete().eq("id", id);
    if (error) throw error;
  }
}

export async function createTemplateItem(_payload) {
  const payload = {
    template_id: String(_payload?.template_id || "").trim(),
    phase: String(_payload?.phase || "").trim() || null,
    area: String(_payload?.area || "").trim() || null,
    title: String(_payload?.title || "").trim(),
    due_basis: String(_payload?.due_basis || "start").trim(),
    offset_days: Number(_payload?.offset_days ?? 0),
    sort_order: Number(_payload?.sort_order ?? 0),
  };
  if (!payload.template_id) throw new Error("template_id é obrigatório.");
  if (!payload.title) throw new Error("Título é obrigatório.");
  try {
    const { adminFetch } = await import("./adminFetch");
    await adminFetch("/api/admin/checklist-template-items", { method: "POST", body: payload });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("checklist_template_items").insert(payload);
    if (error) throw error;
  }
}

export async function updateTemplateItem(_id, _payload) {
  const id = String(_id || "").trim();
  if (!id) return;
  const payload = { ...(_payload || {}) };
  if (payload.title !== undefined) {
    const t = String(payload.title || "").trim();
    if (!t) throw new Error("Título é obrigatório.");
    payload.title = t;
  }
  if (payload.phase !== undefined) payload.phase = String(payload.phase || "").trim() || null;
  if (payload.area !== undefined) payload.area = String(payload.area || "").trim() || null;
  if (payload.due_basis !== undefined) payload.due_basis = String(payload.due_basis || "start").trim();
  if (payload.offset_days !== undefined) payload.offset_days = Number(payload.offset_days ?? 0);
  if (payload.sort_order !== undefined) payload.sort_order = Number(payload.sort_order ?? 0);

  try {
    const { adminFetch } = await import("./adminFetch");
    await adminFetch(`/api/admin/checklist-template-items/${id}`, { method: "PATCH", body: payload });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("checklist_template_items").update(payload).eq("id", id);
    if (error) throw error;
  }
}

export async function deleteTemplateItem(_id) {
  const id = String(_id || "").trim();
  if (!id) return;
  try {
    const { adminFetch } = await import("./adminFetch");
    await adminFetch(`/api/admin/checklist-template-items/${id}`, { method: "DELETE" });
    return;
  } catch (_) {
    ensure();
    const { error } = await supabase.from("checklist_template_items").delete().eq("id", id);
    if (error) throw error;
  }
}
