import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function requireAdmin({ url, anon, token }) {
  const requester = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await requester.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Sessão inválida." };

  const { data: prof, error: profErr } = await requester
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profErr) return { ok: false, status: 403, error: "Não foi possível validar permissões." };
  if (!prof?.is_active) return { ok: false, status: 403, error: "Usuário inativo." };
  if (prof?.role !== "admin") return { ok: false, status: 403, error: "Apenas ADMIN." };

  return { ok: true };
}

export default async function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) return json(res, 500, { error: "Supabase não configurado." });
  if (!serviceKey) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Token ausente." });

  const gate = await requireAdmin({ url, anon, token });
  if (!gate.ok) return json(res, gate.status, { error: gate.error });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (req.method === "GET") {
    const templateId = String(req.query?.template_id || "").trim();
    if (!templateId) return json(res, 400, { error: "template_id é obrigatório." });

    const { data, error } = await admin
      .from("checklist_template_items")
      // NOTE: keep select string in a single line to avoid bundler parsing errors.
      // 'area' is kept for backward-compatibility, but the UI uses responsible_id.
      .select("id, template_id, phase, responsible_id, title, due_basis, offset_days, sort_order, created_at, area")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("phase", { ascending: true })
      .order("title", { ascending: true });

    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { data: data || [] });
  }

  if (req.method === "POST") {
    const {
      template_id,
      phase,
      area,
      responsible_id,
      title,
      due_basis = "start",
      offset_days = 0,
      sort_order = 0
    } = req.body || {};

    const tpl = String(template_id || "").trim();
    const t = String(title || "").trim();

    if (!tpl) return json(res, 400, { error: "template_id é obrigatório." });
    if (!t) return json(res, 400, { error: "Título é obrigatório." });

    const payload = {
      template_id: tpl,
      phase: String(phase || "").trim() || null,
      area: String(area || "").trim() || null,
      responsible_id: responsible_id ? String(responsible_id).trim() : null,
      title: t,
      due_basis: String(due_basis || "start").trim() === "end" ? "end" : "start",
      offset_days: Number(offset_days ?? 0),
      sort_order: Number(sort_order ?? 0)
    };

    const { data, error } = await admin
      .from("checklist_template_items")
      .insert(payload)
      .select("id")
      .single();

    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { id: data?.id });
  }

  res.setHeader("Allow", "GET,POST");
  return json(res, 405, { error: "Method not allowed" });
}
