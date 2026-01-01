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

  // Confirma sessão
  const { data: authData, error: authErr } = await requesterClient.auth.getUser();
  if (authErr || !authData?.user) {
    return { ok: false, status: 401, error: "Sessão inválida." };
  }

  // Valida papel via profiles (RLS permite ler o próprio)
  const { data: me, error: meErr } = await requesterClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (meErr) return { ok: false, status: 403, error: meErr.message || "Sem permissão." };
  if (!me?.is_active) return { ok: false, status: 403, error: "Usuário inativo." };
  if (me?.role !== "admin") return { ok: false, status: 403, error: "Apenas administrador." };

  return { ok: true, me };
}

async function safeUpdateByEq(admin, table, patch, col, oldId) {
  try {
    const { error } = await admin.from(table).update(patch).eq(col, oldId);
    // Se a coluna não existir nesse schema, ignoramos silenciosamente.
    if (error && !/column .* does not exist/i.test(error.message || "")) return { ok: false, error };
    return { ok: true };
  } catch (e) {
    // Falhas não críticas não devem quebrar o fluxo de senha
    return { ok: true };
  }
}

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
  const profileId = String(id || "").trim();
  const pwd = String(password || "");
  if (!profileId) return json(res, 400, { error: "id é obrigatório." });
  if (!pwd || pwd.length < 8) return json(res, 400, { error: "Senha deve ter pelo menos 8 caracteres." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1) Carrega o profile alvo (para descobrir email)
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, email, name")
    .eq("id", profileId)
    .maybeSingle();

  if (pErr) return json(res, 400, { error: pErr.message || "Falha ao carregar profile." });
  if (!profile) return json(res, 404, { error: "Profile não encontrado." });

  // 2) Tenta atualizar senha assumindo que profile.id == auth.users.id (fluxo ideal)
  const upd = await admin.auth.admin.updateUserById(profileId, { password: pwd });

  // 2a) Se funcionou, pronto
  if (!upd?.error) return json(res, 200, { ok: true, mode: "updated" });

  const msg = String(upd.error?.message || "");
  const isNotFound = /user not found/i.test(msg);

  // 2b) Se não existe no Auth, criamos o usuário e MIGRAMOS o profile para o novo auth.id
  if (isNotFound) {
    if (!profile.email) {
      return json(res, 400, {
        error: "Este usuário não tem e-mail. Para criar login, informe um e-mail válido."
      });
    }

    const created = await admin.auth.admin.createUser({
      email: profile.email,
      password: pwd,
      email_confirm: true,
      user_metadata: { name: profile.name || null }
    });

    if (created?.error) {
      return json(res, 400, { error: created.error.message || "Falha ao criar usuário no Auth." });
    }

    const newAuthId = created?.data?.user?.id;
    if (!newAuthId) return json(res, 500, { error: "Falha ao obter ID do usuário criado." });

    // Migração de referências para não quebrar responsabilidades
    // Tabelas conhecidas que referenciam profiles.id
    await safeUpdateByEq(admin, "immersion_access", { profile_id: newAuthId }, "profile_id", profileId);
    await safeUpdateByEq(admin, "immersion_tasks", { responsible_id: newAuthId }, "responsible_id", profileId);
    await safeUpdateByEq(admin, "checklist_template_items", { responsible_id: newAuthId }, "responsible_id", profileId);

    // Campos opcionais em immersions (dependem do schema)
    await safeUpdateByEq(admin, "immersions", { educational_consultant: newAuthId }, "educational_consultant", profileId);
    await safeUpdateByEq(admin, "immersions", { instructional_designer: newAuthId }, "instructional_designer", profileId);
    await safeUpdateByEq(admin, "immersions", { production: newAuthId }, "production", profileId);
    await safeUpdateByEq(admin, "immersions", { events: newAuthId }, "events", profileId);

    // Atualiza PK do profile para alinhar com auth.uid() (RLS / sessão)
    // 1) cria/atualiza profile no novo id e 2) remove o antigo
    const { data: oldProfile } = await admin.from("profiles").select("*").eq("id", profileId).maybeSingle();

    // Insert no novo id (se já existir, update)
    const upsertPayload = {
      id: newAuthId,
      name: oldProfile?.name || profile.name || null,
      email: oldProfile?.email || profile.email || null,
      role: oldProfile?.role || "viewer",
      is_active: oldProfile?.is_active ?? true,
      permissions: oldProfile?.permissions ?? null,
      last_login_at: oldProfile?.last_login_at ?? null
    };

    const { error: upsertErr } = await admin.from("profiles").upsert(upsertPayload, { onConflict: "id" });
    if (upsertErr) return json(res, 400, { error: upsertErr.message || "Falha ao migrar profile." });

    // Remove o profile antigo (para não duplicar na lista)
    await admin.from("profiles").delete().eq("id", profileId);

    return json(res, 200, { ok: true, mode: "created_and_migrated", new_id: newAuthId });
  }

  // 2c) Qualquer outro erro
  return json(res, 400, { error: upd.error?.message || "Falha ao atualizar senha." });
}
