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

  const id = String(req.query?.id || "").trim();
  if (!id) return json(res, 400, { error: "id inválido." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (req.method === "PATCH") {
    const { name, description, is_active } = req.body || {};
    const patch = {};
    if (name !== undefined) {
      const v = String(name || "").trim();
      if (!v) return json(res, 400, { error: "Nome do template é obrigatório." });
      patch.name = v;
    }
    if (description !== undefined) patch.description = String(description || "").trim() || null;
    if (is_active !== undefined) patch.is_active = is_active === false ? false : true;

    const { error } = await admin.from("checklist_templates").update(patch).eq("id", id);
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    // Safety: delete items first (even though FK cascade exists)
    await admin.from("checklist_template_items").delete().eq("template_id", id);
    const { error } = await admin.from("checklist_templates").delete().eq("id", id);
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { ok: true });
  }

  res.setHeader("Allow", "PATCH,DELETE");
  return json(res, 405, { error: "Method not allowed" });
}
