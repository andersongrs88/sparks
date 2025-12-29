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

  const requesterId = userData.user.id;
  const { data: requesterProfile, error: profErr } = await requesterClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", requesterId)
    .single();

  if (profErr) return { ok: false, status: 403, error: "Não foi possível validar permissões." };
  if (!requesterProfile?.is_active) return { ok: false, status: 403, error: "Usuário inativo." };
  if (requesterProfile?.role !== "admin") return { ok: false, status: 403, error: "Apenas ADMIN." };
  return { ok: true };
}

/**
 * PATCH /api/admin/update-user
 * body: { id, name, email, role, is_active }
 */
export default async function handler(req, res) {
  if (req.method !== "PATCH") return json(res, 405, { error: "Method not allowed" });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return json(res, 500, { error: "Supabase não configurado." });
  if (!serviceKey) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Token ausente." });

  const gate = await requireAdmin({ url, anon, token });
  if (!gate.ok) return json(res, gate.status, { error: gate.error });

  const { id, name, email, role, is_active } = body;
  const body = req.body || {};
  const permissions = body.permissions;
  const hasPermissionsKey = Object.prototype.hasOwnProperty.call(body, "permissions");
  const userId = String(id || "").trim();
  if (!userId) return json(res, 400, { error: "id é obrigatório." });

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase() || null;
  const cleanRole = String(role || "viewer").trim() || "viewer";
  const cleanActive = is_active === false ? false : true;
  if (!cleanName) return json(res, 400, { error: "Nome é obrigatório." });

  // permissions: aceita objeto simples (mapa de booleanos). Qualquer outro tipo vira null.
  const cleanPermissions = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions
    : null;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1) Update Auth email (optional)
  if (cleanEmail) {
    const { error: upAuthErr } = await admin.auth.admin.updateUserById(userId, { email: cleanEmail });
    if (upAuthErr) {
      // Do not block profile update if email update fails (e.g., email already in use)
      return json(res, 400, { error: upAuthErr.message || "Falha ao atualizar e-mail do Auth." });
    }
  }

  // 2) Upsert profile
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        ...(hasPermissionsKey ? { permissions: cleanPermissions } : {}),
        is_active: cleanActive
      },
      { onConflict: "id" }
    );

  if (upsertErr) return json(res, 500, { error: upsertErr.message || "Falha ao salvar profile." });

  return json(res, 200, { ok: true });
}
