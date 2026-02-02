import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function normType(t) {
  const v = (t || "").trim();
  return v ? v : null;
}

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

function key(...parts) {
  return parts.map((p) => String(p ?? "").trim().toLowerCase()).join("::");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const immersion_id = req.body?.immersion_id;
    const immersion_type = normType(req.body?.immersion_type);
    const include = req.body?.include || { tasks: true, schedule: true, materials: true, tools: true, videos: true };

    if (!immersion_id) return res.status(400).json({ error: "immersion_id é obrigatório." });

    // Fetch immersion to get dates if not provided
    const { data: imm, error: immErr } = await supabase
      .from("immersions")
      .select("id,start_date,end_date,type")
      .eq("id", immersion_id)
      .maybeSingle();
    if (immErr) throw immErr;

    const startDate = asDateOnly(req.body?.start_date || imm?.start_date);
    const endDate = asDateOnly(req.body?.end_date || imm?.end_date);
    const type = immersion_type || normType(imm?.type);

    // =====================
    // 1) TASK TEMPLATES -> immersion_tasks
    // =====================
    if (include.tasks) {
      try {
        let q = supabase
          .from("task_templates")
          .select("title,phase,immersion_type,status")
          .order("phase", { ascending: true })
          .order("title", { ascending: true });
        if (type) q = q.or(`immersion_type.eq.${type},immersion_type.is.null`);
        const { data: tpls, error } = await q;
        if (error) throw error;

        const { data: existing, error: exErr } = await supabase
          .from("immersion_tasks")
          .select("title,phase")
          .eq("immersion_id", immersion_id);
        if (exErr) throw exErr;

        const existingKeys = new Set((existing || []).map((t) => key(t.phase, t.title)));
        const rows = (tpls || [])
          .filter((t) => (t.status || "published") !== "draft")
          .map((t) => ({
            immersion_id,
            title: t.title,
            phase: t.phase,
            status: "pending",
          }))
          .filter((r) => !existingKeys.has(key(r.phase, r.title)));

        if (rows.length) {
          const { error: insErr } = await supabase.from("immersion_tasks").insert(rows);
          if (insErr) throw insErr;
        }
      } catch (e) {
        // best-effort: if table missing in older envs, ignore
        const msg = String(e?.message || "").toLowerCase();
        if (!msg.includes("does not exist")) throw e;
      }
    }

    // =====================
    // 2) SCHEDULE TEMPLATES -> immersion_schedule_items
    // =====================
    if (include.schedule) {
      try {
        let q = supabase
          .from("immersion_schedule_templates")
          .select("*")
          .order("day_index", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("start_time", { ascending: true, nullsFirst: true });
        if (type) q = q.or(`immersion_type.eq.${type},immersion_type.is.null`);
        const { data: tpls, error } = await q;
        if (error) throw error;

        const { data: existing, error: exErr } = await supabase
          .from("immersion_schedule_items")
          .select("day_index,start_time,title")
          .eq("immersion_id", immersion_id);
        if (exErr) throw exErr;

        const existingKeys = new Set((existing || []).map((s) => key(s.day_index, s.start_time, s.title)));

        const payload = (tpls || [])
          .filter((t) => (t.status || "published") !== "draft")
          .map((s) => {
            const dayIndex = Number.isFinite(s.day_index) ? s.day_index : 1;
            const dayLabel = s.day_label || `Dia ${dayIndex}`;
            const dayDate = startDate ? addDays(startDate, Math.max(0, dayIndex - 1)) : null;
            return {
              immersion_id,
              day_index: dayIndex,
              day_label: dayLabel,
              day_date: dayDate,
              start_time: s.start_time ?? null,
              end_time: s.end_time ?? null,
              title: s.title,
              notes: s.notes ?? null,
              sort_order: s.sort_order ?? 0,
            };
          })
          .filter((r) => !existingKeys.has(key(r.day_index, r.start_time, r.title)));

        if (payload.length) {
          const { error: insErr } = await supabase.from("immersion_schedule_items").insert(payload);
          if (insErr) throw insErr;
        }
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (!msg.includes("does not exist")) throw e;
      }
    }

    // =====================
    // 3) MATERIAL TEMPLATES -> immersion_materials
    // =====================
    if (include.materials) {
      try {
        let q = supabase
          .from("immersion_material_templates")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (type) q = q.or(`immersion_type.eq.${type},immersion_type.is.null`);
        const { data: tpls, error } = await q;
        if (error) throw error;

        const { data: existing, error: exErr } = await supabase
          .from("immersion_materials")
          .select("name,link")
          .eq("immersion_id", immersion_id);
        if (exErr) throw exErr;

        const existingKeys = new Set((existing || []).map((m) => key(m.name, m.link)));

        const payload = (tpls || [])
          .filter((t) => (t.status || "published") !== "draft")
          .map((m) => ({
            immersion_id,
            name: m.name,
            link: m.link ?? null,
            notes: m.notes ?? null,
            sort_order: m.sort_order ?? 0,
          }))
          .filter((r) => !existingKeys.has(key(r.name, r.link)));

        if (payload.length) {
          const { error: insErr } = await supabase.from("immersion_materials").insert(payload);
          if (insErr) throw insErr;
        }
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (!msg.includes("does not exist")) throw e;
      }
    }

    // =====================
    // 4) TOOL TEMPLATES -> immersion_tools
    // =====================
    if (include.tools) {
      try {
        let q = supabase
          .from("immersion_tool_templates")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (type) q = q.or(`immersion_type.eq.${type},immersion_type.is.null`);
        const { data: tpls, error } = await q;
        if (error) throw error;

        const { data: existing, error: exErr } = await supabase
          .from("immersion_tools")
          .select("name,link")
          .eq("immersion_id", immersion_id);
        if (exErr) throw exErr;

        const existingKeys = new Set((existing || []).map((m) => key(m.name, m.link)));

        const payload = (tpls || [])
          .filter((t) => (t.status || "published") !== "draft")
          .map((m) => ({
            immersion_id,
            name: m.name,
            link: m.link ?? null,
            print_guidance: m.print_guidance ?? null,
            print_quantity: m.print_quantity ?? null,
            sort_order: m.sort_order ?? 0,
          }))
          .filter((r) => !existingKeys.has(key(r.name, r.link)));

        if (payload.length) {
          const { error: insErr } = await supabase.from("immersion_tools").insert(payload);
          if (insErr) throw insErr;
        }
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (!msg.includes("does not exist")) throw e;
      }
    }

    // =====================
    // 5) VIDEO TEMPLATES -> immersion_videos
    // =====================
    if (include.videos) {
      try {
        let q = supabase
          .from("immersion_video_templates")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true });
        if (type) q = q.or(`immersion_type.eq.${type},immersion_type.is.null`);
        const { data: tpls, error } = await q;
        if (error) throw error;

        const { data: existing, error: exErr } = await supabase
          .from("immersion_videos")
          .select("title,link")
          .eq("immersion_id", immersion_id);
        if (exErr) throw exErr;

        const existingKeys = new Set((existing || []).map((m) => key(m.title, m.link)));

        const payload = (tpls || [])
          .filter((t) => (t.status || "published") !== "draft")
          .map((v) => ({
            immersion_id,
            title: v.title,
            when_to_use: v.when_to_use ?? null,
            link: v.link ?? null,
            area: v.area ?? null,
            sort_order: v.sort_order ?? 0,
          }))
          .filter((r) => !existingKeys.has(key(r.title, r.link)));

        if (payload.length) {
          const { error: insErr } = await supabase.from("immersion_videos").insert(payload);
          if (insErr) throw insErr;
        }
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (!msg.includes("does not exist")) throw e;
      }
    }

    return res.status(200).json({
      ok: true,
      applied: {
        tasks: !!include.tasks,
        schedule: !!include.schedule,
        materials: !!include.materials,
        tools: !!include.tools,
        videos: !!include.videos,
      },
      type,
      start_date: startDate,
      end_date: endDate,
    });
  } catch (e) {
    console.error("apply-type-templates error", e);
    return res.status(500).json({ error: e?.message || "Erro ao aplicar templates." });
  }
}
