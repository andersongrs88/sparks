import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function stableRules() {
  return [
    { rule_key: "task_overdue_daily", label: "Tarefas atrasadas (diário)", is_enabled: true },
    { rule_key: "task_due_soon_weekly", label: "Vencendo em até 7 dias (semanal)", is_enabled: true },
    { rule_key: "immersion_risk_daily", label: "Risco de imersão (diário)", is_enabled: true },
  ];
}

export default async function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) return json(res, 500, { error: "Supabase não configurado." });
  if (!serviceKey) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Token ausente." });

  const requesterClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
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
  if (requesterProfile?.role !== "admin") return json(res, 403, { error: "Apenas ADMIN pode gerenciar notificações." });

  const admin = createClient(url, serviceKey);

  // Helper: detect table existence (best-effort)
  async function tableExists(name) {
    try {
      const { error } = await admin.from(name).select("*").limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  const hasRules = await tableExists("email_notification_rules");
  const hasSettings = await tableExists("email_notification_settings");
  const hasTemplates = await tableExists("email_notification_templates");
  const hasLogs = await tableExists("email_notification_log");

  if (req.method === "GET") {
    const baseRules = stableRules();

    let rules = baseRules;
    if (hasRules) {
      const { data } = await admin
        .from("email_notification_rules")
        .select("rule_key,label,is_enabled")
        .in("rule_key", baseRules.map((r) => r.rule_key));
      if (Array.isArray(data) && data.length) {
        // merge with defaults (ensures new rules appear)
        const map = new Map(data.map((r) => [r.rule_key, r]));
        rules = baseRules.map((r) => ({ ...r, ...(map.get(r.rule_key) || {}) }));
      }
    }

    let settings = { from_email: "", from_name: "", reply_to: "" };
    if (hasSettings) {
      const { data } = await admin.from("email_notification_settings").select("from_email,from_name,reply_to,updated_at").order("updated_at", { ascending: false }).limit(1);
      if (data?.[0]) settings = data[0];
    }

    let templatesObj = {};
    if (hasTemplates) {
      const { data } = await admin.from("email_notification_templates").select("rule_key,subject,intro,footer,updated_at");
      for (const t of (data || [])) templatesObj[t.rule_key] = t;
    }

    let logs = [];
    if (hasLogs) {
      const { data } = await admin
        .from("email_notification_log")
        .select("id,created_at,rule_key,mode,to_email,item_count,status")
        .order("created_at", { ascending: false })
        .limit(50);
      logs = data || [];
    }

    return json(res, 200, { ok: true, rules, settings, templates: templatesObj, logs });
  }

  if (req.method === "POST") {
    const payload = req.body || {};
    const incomingSettings = payload.settings || {};
    const incomingRules = Array.isArray(payload.rules) ? payload.rules : [];
    const incomingTemplates = payload.templates || {};

    // 1) upsert rules (if table exists)
    if (hasRules) {
      const rows = stableRules().map((base) => {
        const found = incomingRules.find((r) => r.rule_key === base.rule_key);
        return {
          rule_key: base.rule_key,
          label: base.label,
          is_enabled: found?.is_enabled !== false,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await admin.from("email_notification_rules").upsert(rows, { onConflict: "rule_key" });
      if (error) return json(res, 500, { error: error.message });
    }

    // 2) upsert settings (singleton last row)
    if (hasSettings) {
      const row = {
        from_email: String(incomingSettings.from_email || "").trim() || null,
        from_name: String(incomingSettings.from_name || "").trim() || null,
        reply_to: String(incomingSettings.reply_to || "").trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("email_notification_settings").insert([row]);
      if (error) return json(res, 500, { error: error.message });
    }

    // 3) upsert templates
    if (hasTemplates) {
      const baseRules = stableRules();
      const rows = baseRules.map((r) => {
        const t = incomingTemplates?.[r.rule_key] || {};
        return {
          rule_key: r.rule_key,
          subject: String(t.subject || "").trim() || null,
          intro: String(t.intro || "").trim() || null,
          footer: String(t.footer || "").trim() || null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await admin.from("email_notification_templates").upsert(rows, { onConflict: "rule_key" });
      if (error) return json(res, 500, { error: error.message });
    }

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
