import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function asDateOnly(d) {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function addDays(date, days) {
  if (!date) return null;
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + (Number(days) || 0));
  return d;
}

function toYmd(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { immersionId, templateId } = req.body || {};
  if (!immersionId || !templateId) {
    return res.status(400).json({ error: "Informe immersionId e templateId" });
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: imm, error: eImm } = await admin
      .from("immersions")
      // Regra do produto (2025-12): todas as tarefas devem ser atribuídas ao Consultor da imersão.
      .select("id, start_date, end_date, educational_consultant")
      .eq("id", immersionId)
      .single();
    if (eImm) throw eImm;

    const start = asDateOnly(imm?.start_date);
    const end = asDateOnly(imm?.end_date);

    const { data: items, error: eItems } = await admin
      .from("checklist_template_items")
      .select("id, template_id, phase, area, responsible_id, title, due_basis, offset_days, sort_order")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("phase", { ascending: true });
    if (eItems) throw eItems;

    if (!items?.length) {
      return res.status(200).json({ ok: true, inserted: 0 });
    }

    // Dedup: evita criar duplicado se o template for aplicado mais de uma vez
    const { data: existing, error: eExisting } = await admin
      .from("immersion_tasks")
      .select("id, title, phase")
      .eq("immersion_id", immersionId)
      .limit(20000);
    if (eExisting) throw eExisting;

    const existingKey = new Set((existing || []).map((t) => `${(t.phase || "").trim()}::${String(t.title || "").trim().toLowerCase()}`));

    const payload = [];
    for (const it of items || []) {
      const title = String(it.title || "").trim();
      if (!title) continue;
      const key = `${(it.phase || "").trim()}::${title.toLowerCase()}`;
      if (existingKey.has(key)) continue;

      const basis = String(it.due_basis || "start").trim().toLowerCase();
      const baseDate = basis === "end" ? end : start;
      const due = addDays(baseDate, it.offset_days);

      payload.push({
        immersion_id: immersionId,
        title,
        phase: it.phase || null,
        area: it.area || null,
        responsible_id: imm?.educational_consultant || null,
        due_date: toYmd(due),
        status: "Programada",
        sort_order: Number.isFinite(it.sort_order) ? it.sort_order : 0,
      });
    }

    if (!payload.length) {
      return res.status(200).json({ ok: true, inserted: 0 });
    }

    const { error: eIns } = await admin.from("immersion_tasks").insert(payload);
    if (eIns) throw eIns;

    // Persiste o template no registro da imersão (se a coluna existir)
    await admin.from("immersions").update({ checklist_template_id: templateId }).eq("id", immersionId);

    return res.status(200).json({ ok: true, inserted: payload.length });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Falha ao aplicar checklist template" });
  }
}
