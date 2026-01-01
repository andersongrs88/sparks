import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function isMissingColumnError(err, colName) {
  const msg = (err?.message || err || "").toString();
  return msg.includes(`column`) && msg.includes(colName) && msg.includes("does not exist");
}

async function validateAdmin(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) return { ok: false, status: 500, error: "Supabase ENV ausente (URL/ANON)." };
  if (!serviceKey) return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY não configurada na Vercel." };

  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "Sessão inválida (token ausente)." };

  // Validate session using anon + Authorization header
  const requesterClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userErr } = await requesterClient.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Sessão inválida." };

  const requesterId = userData.user.id;

  // IMPORTANT: read permissions via SERVICE ROLE to avoid RLS/GRANT surprises
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: requesterProfile, error: profErr } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", requesterId)
    .single();

  if (profErr) return { ok: false, status: 403, error: "Não foi possível validar permissões (profiles)." };
  if (!requesterProfile?.is_active) return { ok: false, status: 403, error: "Usuário inativo." };
  if (requesterProfile?.role !== "admin") return { ok: false, status: 403, error: "Apenas ADMIN." };

  return { ok: true, admin, requesterId, url };
}

async function loadSettings(admin) {
  // Try with timestamps first (newer schema)
  let q = admin
    .from("email_notification_settings")
    .select("id, from_email, from_name, reply_to, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(1);

  let { data, error } = await q;
  if (error && isMissingColumnError(error, "created_at")) {
    ({ data, error } = await admin
      .from("email_notification_settings")
      .select("id, from_email, from_name, reply_to")
      .limit(1));
  }

  if (error) throw error;
  const row = (data && data[0]) || null;
  return row || { from_email: "", from_name: "", reply_to: "" };
}

async function loadRules(admin) {
  // Current schema uses "kind" as key
  let { data, error } = await admin
    .from("email_notification_rules")
    .select("id, kind, is_enabled, cadence, lookback_minutes")
    .order("kind", { ascending: true });

  if (error && isMissingColumnError(error, "is_enabled")) {
    // older column name
    ({ data, error } = await admin
      .from("email_notification_rules")
      .select("id, kind, is_enabled, is_enabled as is_enabled_alias, cadence, lookback_minutes")
      .order("kind", { ascending: true }));
  }

  if (error) throw error;
  return data || [];
}

async function loadTemplates(admin) {
  // Prefer new schema: rule_key + kind
  let { data, error } = await admin
    .from("email_notification_templates")
    .select("rule_key, kind, subject, intro, footer, updated_at")
    .order("kind", { ascending: true });

  if (error && isMissingColumnError(error, "kind")) {
    // Older schema: rule_key only
    ({ data, error } = await admin
      .from("email_notification_templates")
      .select("rule_key, subject, intro, footer, updated_at")
      .order("rule_key", { ascending: true }));
  }

  if (error) throw error;

  const rows = (data || []).map((r) => ({
    rule_key: r.rule_key ?? r.kind ?? null,
    kind: r.kind ?? r.rule_key ?? null,
    subject: r.subject ?? "",
    intro: r.intro ?? "",
    footer: r.footer ?? "",
    updated_at: r.updated_at ?? null
  }));

  return rows;
}

async function saveSettings(admin, settings) {
  const payload = {
    from_email: settings?.from_email || null,
    from_name: settings?.from_name || null,
    reply_to: settings?.reply_to || null
  };

  // Try upsert with updated_at (newer), fallback if column missing
  let { error } = await admin
    .from("email_notification_settings")
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (error && isMissingColumnError(error, "updated_at")) {
    ({ error } = await admin.from("email_notification_settings").upsert(payload, { onConflict: "id" }));
  }

  if (error) throw error;
}

async function saveTemplates(admin, templates) {
  const list = Array.isArray(templates) ? templates : [];
  // sanitize & normalize key
  const normalized = list
    .map((t) => {
      const key = (t.kind || t.rule_key || "").trim();
      if (!key) return null;
      return {
        rule_key: key,
        kind: key,
        subject: t.subject ?? "",
        intro: t.intro ?? "",
        footer: t.footer ?? "",
        updated_at: new Date().toISOString()
      };
    })
    .filter(Boolean);

  // If there are no templates to save, just return
  if (!normalized.length) return;

  // Try bulk upsert with kind, fallback if kind column missing (keep rule_key only)
  let { error } = await admin
    .from("email_notification_templates")
    .upsert(normalized, { onConflict: "rule_key" });

  if (error && (isMissingColumnError(error, "kind") || isMissingColumnError(error, "updated_at"))) {
    const fallbackRows = normalized.map(({ rule_key, subject, intro, footer }) => ({
      rule_key,
      subject,
      intro,
      footer
    }));
    ({ error } = await admin.from("email_notification_templates").upsert(fallbackRows, { onConflict: "rule_key" }));
  }

  if (error) throw error;
}

/**
 * GET/POST /api/admin/email-notification-config
 * GET: returns { settings, rules, templates }
 * POST: body { settings, templates }
 */
export default async function handler(req, res) {
  try {
    const v = await validateAdmin(req);
    if (!v.ok) return json(res, v.status, { error: v.error });

    const admin = v.admin;

    if (req.method === "GET") {
      const [settings, rules, templates] = await Promise.all([
        loadSettings(admin),
        loadRules(admin),
        loadTemplates(admin)
      ]);
      return json(res, 200, { settings, rules, templates });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      await saveSettings(admin, body.settings || {});
      await saveTemplates(admin, body.templates || []);
      // return fresh values
      const [settings, rules, templates] = await Promise.all([
        loadSettings(admin),
        loadRules(admin),
        loadTemplates(admin)
      ]);
      return json(res, 200, { ok: true, settings, rules, templates });
    }

    return json(res, 405, { error: "Método não suportado." });
  } catch (err) {
    console.error("[email-notification-config] error:", err);
    return json(res, 500, {
      error: "Falha na requisição (500).",
      details: err?.message || String(err)
    });
  }
}
