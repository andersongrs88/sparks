import { getServerSupabase } from "../../../lib/serverSupabase";

function json(res, status, payload) {
  res.status(status).json(payload);
}

function dateAddDays(isoDate, days) {
  if (!isoDate) return null;
  const d = new Date(isoDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const sb = getServerSupabase();
    const { source_id, overrides } = req.body || {};
    if (!source_id) return json(res, 400, { error: "source_id obrigatório" });
    if (!overrides?.immersion_name) return json(res, 400, { error: "overrides.immersion_name obrigatório" });
    if (!overrides?.start_date) return json(res, 400, { error: "overrides.start_date obrigatório" });
    if (!overrides?.end_date) return json(res, 400, { error: "overrides.end_date obrigatório" });

    // 1) Lê a imersão fonte
    const { data: src, error: srcErr } = await sb
      .from("immersions")
      .select("*")
      .eq("id", source_id)
      .single();
    if (srcErr) throw srcErr;

    const srcStart = src?.start_date;
    const newStart = overrides.start_date;
    const deltaDays = srcStart ? Math.round((new Date(newStart) - new Date(srcStart)) / (1000 * 60 * 60 * 24)) : 0;

    // 2) Cria a nova imersão (prioriza overrides)
    const payload = {
      ...src,
      ...overrides,
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
    };

    const { data: createdRows, error: insErr } = await sb
      .from("immersions")
      .insert([payload])
      .select("*");
    if (insErr) throw insErr;
    const created = createdRows?.[0];
    if (!created?.id) throw new Error("Falha ao criar imersão clonada.");

    const newId = created.id;

    // 3) Helpers: copia tabela relacionada (best-effort)
    async function cloneTable({ table, mapRow }) {
      const { data, error } = await sb
        .from(table)
        .select("*")
        .eq("immersion_id", source_id)
        .limit(10000);
      if (error) {
        // Se a base ainda não tem a tabela, não bloqueia.
        const msg = (error.message || "").toString();
        if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("Could not find")) {
          return;
        }
        throw error;
      }
      if (!data?.length) return;
      const rows = data.map((r) => {
        const base = { ...r };
        delete base.id;
        delete base.created_at;
        delete base.updated_at;
        base.immersion_id = newId;
        return mapRow ? mapRow(base) : base;
      });
      const { error: e2 } = await sb.from(table).insert(rows);
      if (e2) throw e2;
    }

    // 4) Copia módulos
    await cloneTable({
      table: "immersion_tasks",
      mapRow: (r) => ({
        ...r,
        status: "Programada",
        done_at: null,
        done_by: null,
        due_date: r.due_date ? dateAddDays(r.due_date, deltaDays) : r.due_date,
      }),
    });

    await cloneTable({
      table: "immersion_schedule_items",
      mapRow: (r) => ({
        ...r,
        date: r.date ? dateAddDays(r.date, deltaDays) : r.date,
      }),
    });

    await cloneTable({ table: "immersion_materials" });
    await cloneTable({ table: "immersion_tools" });
    await cloneTable({ table: "immersion_videos" });
    await cloneTable({ table: "immersion_pdca" });
    await cloneTable({ table: "immersion_costs" });

    return json(res, 200, { id: newId });
  } catch (e) {
    return json(res, 500, { error: e?.message || "Falha ao clonar imersão." });
  }
}
