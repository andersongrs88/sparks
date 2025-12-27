import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

/**
 * Aplica um checklist template em uma imersão e gera tarefas.
 *
 * Implementação (server-side):
 * - Persiste immersions.checklist_template_id
 * - Chama a RPC public.generate_tasks_from_checklist_template
 *   (criada na migration 001_template_to_tasks_migration.sql)
 *
 * Body aceito (compatibilidade):
 * - { immersionId, templateId, overwrite? }
 * - { immersion_id, template_id, overwrite? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const immersionId = body.immersionId || body.immersion_id;
  const templateId = body.templateId || body.template_id;
  const overwrite = !!body.overwrite;

  if (!immersionId || !templateId) {
    return res.status(400).json({ error: "Informe immersionId e templateId" });
  }

  try {
    const admin = getSupabaseAdmin();

    // 1) persiste o template na imersão
    const { error: eUpd } = await admin.from("immersions").update({ checklist_template_id: templateId }).eq("id", immersionId);
    if (eUpd) throw eUpd;

    // 2) gera tarefas via RPC (sem duplicar)
    const { data: inserted, error: eRpc } = await admin.rpc("generate_tasks_from_checklist_template", {
      p_immersion_id: immersionId,
      p_template_id: templateId,
      p_overwrite: overwrite,
    });
    if (eRpc) throw eRpc;

    return res.status(200).json({ ok: true, inserted: Number(inserted || 0) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Falha ao aplicar checklist template" });
  }
}
