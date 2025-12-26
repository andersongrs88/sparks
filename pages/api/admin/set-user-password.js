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
  const requesterClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userErr } = await requesterClient.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Sessão inválida." };

  const { data: requesterProfile, error: profErr } = await requesterClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profErr) return { ok: false, status: 403, error: "Não foi possível validar permissões." };
  if (!requesterProfile?.is_active) return { ok: false, status: 403, error: "Usuário inativo." };
  if (requesterProfile?.role !== "admin") return { ok: false, status: 403, error: "Apenas ADMIN." };
  return { ok: true };
}

/**
 * POST /api/admin/set-user-password
 * body: { id, password }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return json(res, 500, { error: "Supabase não configurado." });
  if (!serviceKey) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Token ausente." });

  const gate = await requireAdmin({ url, anon, token });
  if (!gate.ok) return json(res, gate.status, { error: gate.error });

  const { id, password } = req.body || {};
  const userId = String(id || "").trim();
  const pwd = String(password || "");
  if (!userId) return json(res, 400, { error: "id é obrigatório." });
  if (!pwd || pwd.length < 8) return json(res, 400, { error: "Senha deve ter pelo menos 8 caracteres." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pwd });
  if (error) return json(res, 400, { error: error.message || "Falha ao atualizar senha." });

  return json(res, 200, { ok: true });
}
