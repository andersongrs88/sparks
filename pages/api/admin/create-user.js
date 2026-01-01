import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

/**
 * POST /api/admin/create-user
 * body: { name, email, password, role, is_active }
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

  const { name, email, password, role, is_active } = req.body || {};

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  const cleanRole = String(role || "viewer").trim();
  const cleanActive = is_active === false ? false : true;

  if (!cleanName) return json(res, 400, { error: "Nome é obrigatório." });
  if (!cleanEmail) return json(res, 400, { error: "E-mail é obrigatório." });
  if (!cleanPassword || cleanPassword.length < 8) {
    return json(res, 400, { error: "Senha é obrigatória (mínimo 8 caracteres)." });
  }

  // 1) Validate requester (anon client with Authorization header)
  const requesterClient = createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const { data: userData, error: userErr } = await requesterClient.auth.getUser();
  if (userErr || !userData?.user) return json(res, 401, { error: "Sessão inválida." });

  const requesterId = userData.user.id;
  const { data: requesterProfile, error: profErr } = await requesterClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", requesterId)
    .single();

  if (profErr) return json(res, 403, { error: "Não foi possível validar permissões." });
  if (!requesterProfile?.is_active) return json(res, 403, { error: "Usuário inativo." });
  if (requesterProfile?.role !== "admin") return json(res, 403, { error: "Apenas ADMIN pode criar usuários." });

  // 2) Admin operation (service role)
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  // Create user in Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password: cleanPassword,
    email_confirm: true
  });

  if (createErr) {
    return json(res, 400, { error: createErr.message || "Falha ao criar usuário." });
  }

  const newUserId = created?.user?.id;
  if (!newUserId) return json(res, 500, { error: "Usuário criado, mas ID não retornado." });

  // Upsert profile (avoid trigger issues; ensures name/role/is_active are set)
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: newUserId,
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        is_active: cleanActive
      },
      { onConflict: "id" }
    );

  if (upsertErr) {
    // If profile fails, user still exists in auth; return actionable error.
    return json(res, 500, {
      error: "Usuário criado no Auth, mas falhou ao salvar profile. Verifique a tabela public.profiles.",
      details: upsertErr.message
    });
  }

  return json(res, 200, { id: newUserId });
}
