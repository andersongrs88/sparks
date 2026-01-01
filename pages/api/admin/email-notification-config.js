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
 * Catálogo estável (ordem importa).
 * rule_key é o identificador lógico; no banco pode estar salvo em `kind` (legacy) ou `rule_key` (novo).
 */
function stableRules() {
  return [
    {
      rule_key: "immersion_created",
      label: "Imersão criada",
      description: "Dispara quando uma nova imersão é criada e possui Consultor definido.",
      rule: "Evento: nova imersão criada (janela por lookback).",
      defaults: {
        cadence: "event",
        lookback_minutes: 120,
        is_enabled: true,
      },
    },
    {
      rule_key: "task_overdue_daily",
      label: "Tarefas atrasadas",
      description: "Resumo diário com tarefas vencidas e ainda não concluídas.",
      rule: "Diário: tasks com due_date < hoje e status != Concluída.",
      defaults: {
        cadence: "daily",
        lookback_minutes: 60,
        is_enabled: true,
      },
    },
    {
      rule_key: "task_due_soon_weekly",
      label: "Vencendo em até 7 dias",
      description: "Resumo semanal com tarefas que vencem nos próximos 7 dias.",
      rule: "Semanal: roda às segundas (ou force=1) listando due_date entre hoje e hoje+7.",
      defaults: {
        cadence: "weekly",
        lookback_minutes: 10080,
        is_enabled: true,
      },
    },
    {
      rule_key: "immersion_risk_daily",
      label: "Risco de imersão",
      description: "Alerta diário quando uma imersão acumula atrasos e entra em risco.",
      rule: "Diário: dispara para Consultor da imersão quando atrasadas >=5 (ou >=3 em execução).",
      defaults: {
        cadence: "daily",
        lookback_minutes: 60,
        is_enabled: true,
      },
    },
  ];
}

async function tableExists(admin, name) {
  try {
    const { error } = await admin.from(name).select("*").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function getRequesterProfile(admin, requesterId) {
  // Usa service-role para evitar RLS em profiles
  const { data, error } = await admin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", requesterId)
    .single();
  if (error) return { error: error.message };
  return { data };
}

// Upsert “sem constraint”: select -> update/insert.
async function upsertByKey(admin, table, keyCol, keyVal, row) {
  const { data: existing, error: selErr } = await admin
    .from(table)
    .select("id")
    .eq(keyCol, keyVal)
    .limit(1);

  if (selErr) throw new Error(selErr.message);

  if (Array.isArray(existing) && existing.length) {
    const { error: updErr } = await admin.from(table).update(row).eq(keyCol, keyVal);
    if (updErr) throw new Error(updErr.message);
    return;
  }

  const { error: insErr } = await admin.from(table).insert([{ ...row, [keyCol]: keyVal }]);
  if (insErr) throw new Error(insErr.message);
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
  const admin = createClient(url, serviceKey);

  const { data: requesterProfile, error: requesterProfError } = await getRequesterProfile(admin, requesterId);
  if (requesterProfError) return json(res, 403, { error: "Não foi possível validar permissões." });
  if (!requesterProfile?.is_active) return json(res, 403, { error: "Usuário inativo." });
  if (requesterProfile?.role !== "admin") return json(res, 403, { error: "Apenas ADMIN pode gerenciar notificações." });

  const baseRules = stableRules();

  const hasRules = await tableExists(admin, "email_notification_rules");
  const hasSettings = await tableExists(admin, "email_notification_settings");
  const hasTemplates = await tableExists(admin, "email_notification_templates");
  const hasLogs = await tableExists(admin, "email_notification_log");

  if (req.method === "GET") {
    // 1) Rules
    let rules = baseRules.map((r) => ({
      rule_key: r.rule_key,
      label: r.label,
      description: r.description,
      rule: r.rule,
      ...r.defaults,
    }));

    if (hasRules) {
      // Suporta schema legado: kind = identificador.
      const { data, error } = await admin
        .from("email_notification_rules")
        .select("kind,rule_key,label,description,cadence,lookback_minutes,is_enabled,updated_at")
        .or(
          baseRules
            .map((r) => `kind.eq.${r.rule_key},rule_key.eq.${r.rule_key}`)
            .join(",")
        );
      if (!error && Array.isArray(data) && data.length) {
        const map = new Map();
        for (const row of data) {
          const key = row.rule_key || row.kind;
          if (key) map.set(key, row);
        }
        rules = rules.map((r) => ({
          ...r,
          ...(map.get(r.rule_key) || {}),
          // Normaliza de volta:
          rule_key: r.rule_key,
          cadence: (map.get(r.rule_key)?.cadence || r.cadence || r.defaults?.cadence),
          lookback_minutes: Number(map.get(r.rule_key)?.lookback_minutes ?? r.lookback_minutes ?? r.defaults?.lookback_minutes ?? 60),
          is_enabled: map.get(r.rule_key)?.is_enabled !== false,
        }));
      }
    }

    // 2) Settings (último registro)
    let settings = { from_email: "", from_name: "", reply_to: "" };
    if (hasSettings) {
      const { data } = await admin
        .from("email_notification_settings")
        .select("from_email,from_name,reply_to,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (data?.[0]) settings = data[0];
    }

    // 3) Templates
    const templatesObj = {};
    if (hasTemplates) {
      const { data, error } = await admin
        .from("email_notification_templates")
        .select("rule_key,kind,label,description,rule_text,subject,intro,footer,updated_at");
      if (!error) {
        for (const t of (data || [])) {
          const key = t.rule_key || t.kind;
          if (key) templatesObj[key] = { ...t, rule_key: key };
        }
      }
    }

    // 4) Logs
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

    // 1) Rules
    if (hasRules) {
      for (const base of baseRules) {
        const incoming = incomingRules.find((r) => (r.rule_key || r.kind) === base.rule_key) || {};
        const next = {
          label: String(incoming.label || base.label),
          description: String(incoming.description || base.description),
          cadence: String(incoming.cadence || base.defaults.cadence || "event"),
          lookback_minutes: Number(incoming.lookback_minutes ?? base.defaults.lookback_minutes ?? 60),
          is_enabled: incoming.is_enabled !== false,
          updated_at: new Date().toISOString(),
        };

        // Prefer schema legado (kind).
        await upsertByKey(admin, "email_notification_rules", "kind", base.rule_key, next);
      }
    }

    // 2) Settings
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

    // 3) Templates
    if (hasTemplates) {
      for (const base of baseRules) {
        const t = incomingTemplates?.[base.rule_key] || {};
        const row = {
          label: String(t.label || base.label),
          description: String(t.description || base.description),
          rule_text: String(t.rule_text || base.rule),
          subject: String(t.subject || "").trim() || null,
          intro: String(t.intro || "").trim() || null,
          footer: String(t.footer || "").trim() || null,
          updated_at: new Date().toISOString(),
        };

        // Prefer schema novo (rule_key). Se não existir, usamos `kind`.
        try {
          await upsertByKey(admin, "email_notification_templates", "rule_key", base.rule_key, row);
        } catch {
          await upsertByKey(admin, "email_notification_templates", "kind", base.rule_key, row);
        }
      }
    }

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
