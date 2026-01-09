import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

// Aceita roles do frontend (ex.: "consultant") e roles já existentes no banco.
function expandRoles(input) {
  const raw = (Array.isArray(input) ? input : [input])
    .filter(Boolean)
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter(Boolean);

  const out = new Set();
  for (const r of raw) {
    const k = r.toLowerCase();
    if (k === "consultant" || k === "consultor") {
      out.add("consultor");
      out.add("consultor_educacao");
      continue;
    }
    if (k === "designer") {
      out.add("designer");
      continue;
    }
    if (k === "production" || k === "producao" || k === "produção") {
      out.add("producao");
      out.add("producao_eventos");
      continue;
    }
    if (k === "events" || k === "eventos") {
      out.add("eventos");
      out.add("producao_eventos");
      continue;
    }
    out.add(k);
  }
  return Array.from(out);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Missing bearer token" });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const rolesParam = url.searchParams.get("roles") || "";
  const onlyActive = (url.searchParams.get("onlyActive") ?? "true").toLowerCase() !== "false";

  // 1) Valida sessão via anon key + token
  const requesterClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: userData, error: userErr } = await requesterClient.auth.getUser();
  if (userErr || !userData?.user) return json(res, 401, { error: "Invalid session" });

  const requesterId = userData.user.id;

  // 2) Usa Service Role para checar permissões do requester e listar perfis
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: requesterProfile, error: rpErr } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", requesterId)
    .maybeSingle();

  if (rpErr) return json(res, 500, { error: rpErr.message });
  if (!requesterProfile?.id || requesterProfile.is_active === false) {
    return json(res, 403, { error: "User inactive or missing profile" });
  }

  // Roles que podem listar usuários para preencher campos de responsáveis.
  // Observação: mantemos compatibilidade com roles antigas e normalizadas.
  const requesterRole = String(requesterProfile.role || "").toLowerCase();
  const allowedRequesterRoles = new Set([
    "admin",
    "consultor",
    "consultor_educacao",
    "designer",
    "producao",
    "eventos",
    "producao_eventos",
  ]);

  if (!allowedRequesterRoles.has(requesterRole)) {
    return json(res, 403, { error: "Not allowed" });
  }

  const roles = rolesParam ? expandRoles(rolesParam) : null;

  let q = admin
    .from("profiles")
    .select("id, name, email, role, is_active")
    .order("name", { ascending: true, nullsFirst: false });

  if (onlyActive) q = q.eq("is_active", true);
  if (roles && roles.length) q = q.in("role", roles);

  const { data, error } = await q;
  if (error) return json(res, 500, { error: error.message });

  return json(res, 200, { profiles: data || [] });
}
