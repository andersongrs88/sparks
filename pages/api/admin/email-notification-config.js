import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export default async function handler(req, res) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
  const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anon) return json(res, 500, { error: "Supabase env ausente (URL/ANON)." });
  if (!service) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY ausente na Vercel." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Sessão inválida (token ausente)." });

  // Client do usuário (para validar sessão)
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json(res, 401, { error: "Sessão inválida (faça login novamente)." });

  // Client service role (para bypass RLS e garantir leitura de profiles/config)
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // Validar ADMIN pelo profiles usando service role (não depende de RLS/GRANT do cliente)
  const { data: requesterProfile, error: profErr } = await admin
    .from("profiles")
    .select("id, role, is_active, name, email")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profErr) return json(res, 500, { error: profErr.message });
  if (!requesterProfile) return json(res, 403, { error: "Perfil não encontrado." });
  if (requesterProfile.role !== "admin" || requesterProfile.is_active !== true) {
    return json(res, 403, { error: "Apenas ADMIN pode gerenciar notificações." });
  }

  if (req.method === "GET") {
    const [{ data: rules, error: rulesErr }, { data: settings, error: setErr }, { data: templates, error: tplErr }, { data: logs, error: logErr }] =
      await Promise.all([
        admin
          .from("email_notification_rules")
          .select("kind,is_enabled,cadence,lookback_minutes")
          .order("kind", { ascending: true }),
        admin
          .from("email_notification_settings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1),
        admin
          .from("email_notification_templates")
          .select("*")
          .order("kind", { ascending: true }),
        admin
          .from("email_notification_log")
          .select("created_at,kind,to_email,subject,item_count,mode,status,error")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (rulesErr) return json(res, 500, { error: rulesErr.message });
    if (setErr) return json(res, 500, { error: setErr.message });
    if (tplErr) return json(res, 500, { error: tplErr.message });
    if (logErr) return json(res, 500, { error: logErr.message });

    return json(res, 200, {
      me: { id: requesterProfile.id, name: requesterProfile.name, email: requesterProfile.email, role: requesterProfile.role },
      rules: rules || [],
      settings: (settings && settings[0]) || null,
      templates: templates || [],
      logs: logs || [],
    });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const settings = body.settings || null;
    const rules = Array.isArray(body.rules) ? body.rules : [];
    const templates = Array.isArray(body.templates) ? body.templates : [];

    // SETTINGS (singleton)
    if (settings) {
      const clean = {
        from_email: settings.from_email ? String(settings.from_email).trim() : null,
        from_name: settings.from_name ? String(settings.from_name).trim() : null,
        reply_to: settings.reply_to ? String(settings.reply_to).trim() : null,
        updated_at: new Date().toISOString(),
      };

      const { data: cur, error: curErr } = await admin
        .from("email_notification_settings")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);

      if (curErr) return json(res, 500, { error: curErr.message });

      if (cur && cur[0]?.id) {
        const { error } = await admin.from("email_notification_settings").update(clean).eq("id", cur[0].id);
        if (error) return json(res, 500, { error: error.message });
      } else {
        const { error } = await admin.from("email_notification_settings").insert(clean);
        if (error) return json(res, 500, { error: error.message });
      }
    }

    // RULES (por kind)
    for (const r of rules) {
      const kind = String(r.kind || "").trim();
      if (!kind) continue;

      const patch = {
        is_enabled: r.is_enabled === true,
        cadence: String(r.cadence || "").trim() || "event",
        lookback_minutes: Number.isFinite(Number(r.lookback_minutes)) ? Number(r.lookback_minutes) : 60,
      };

      const { data: upd, error: updErr } = await admin
        .from("email_notification_rules")
        .update(patch)
        .eq("kind", kind)
        .select("id");

      if (updErr) return json(res, 500, { error: updErr.message });

      if (!upd || upd.length === 0) {
        const { error: insErr } = await admin
          .from("email_notification_rules")
          .insert({ kind, ...patch });

        if (insErr) return json(res, 500, { error: insErr.message });
      }
    }

    // TEMPLATES (upsert por kind)
    if (templates.length) {
      const rows = templates
        .map((t) => ({
          kind: String(t.kind || "").trim(),
          subject: t.subject ? String(t.subject).trim() : null,
          intro: t.intro ? String(t.intro).trim() : null,
          footer: t.footer ? String(t.footer).trim() : null,
          updated_at: new Date().toISOString(),
        }))
        .filter((x) => x.kind);

      if (rows.length) {
        const { error } = await admin.from("email_notification_templates").upsert(rows, { onConflict: "kind" });
        if (error) return json(res, 500, { error: error.message });
      }
    }

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
