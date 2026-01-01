import { createClient } from "@supabase/supabase-js";
import {
  EMAIL_RULES_DEFAULTS,
  EMAIL_TEMPLATES_DEFAULTS,
} from "../../../lib/emailNotificationDefaults";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function stableRules() {
  // Mantém compatibilidade com bases antigas (não depende de migrations).
  return EMAIL_RULES_DEFAULTS.map((r) => ({
    rule_key: r.key,
    label: r.label,
    description: r.description,
    is_enabled: r.is_enabled,
    cadence: r.cadence,
    lookback_minutes: r.lookback_minutes,
    config: r.config,
  }));
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

  // Detecta o "id" da regra no schema atual (rule_key vs kind) e se existem colunas opcionais.
  async function detectColumns(table, cols) {
    // tenta em bloco; se falhar por colunas faltantes, devolve as que deram certo.
    const ok = {};
    for (const c of cols) {
      try {
        const { error } = await admin.from(table).select(c).limit(1);
        ok[c] = !error;
      } catch {
        ok[c] = false;
      }
    }
    return ok;
  }

  if (req.method === "GET") {
    const baseRules = stableRules();
    let rules = baseRules;
    if (hasRules) {
      const col = await detectColumns("email_notification_rules", [
        "rule_key",
        "kind",
        "label",
        "description",
        "is_enabled",
        "cadence",
        "lookback_minutes",
        "config",
        "updated_at",
      ]);

      const idCol = col.rule_key ? "rule_key" : col.kind ? "kind" : null;

      if (idCol) {
        const selectCols = [
          idCol,
          col.label ? "label" : null,
          col.description ? "description" : null,
          col.is_enabled ? "is_enabled" : null,
          col.cadence ? "cadence" : null,
          col.lookback_minutes ? "lookback_minutes" : null,
          col.config ? "config" : null,
        ]
          .filter(Boolean)
          .join(",");

        const { data } = await admin.from("email_notification_rules").select(selectCols);

        if (Array.isArray(data) && data.length) {
          const map = new Map(data.map((r) => [r[idCol], r]));
          rules = baseRules.map((r) => {
            const hit = map.get(r.rule_key);
            if (!hit) return r;
            const merged = { ...r, ...hit };
            // normaliza quando o schema usa kind
            merged.rule_key = r.rule_key;
            return merged;
          });
        }
      }
    }

    let settings = { from_email: "", from_name: "", reply_to: "" };
    if (hasSettings) {
      const { data } = await admin
        .from("email_notification_settings")
        .select("from_email,from_name,reply_to,updated_at,id")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(1);
      if (data?.[0]) settings = data[0];
    }

    let templatesObj = {};
    if (hasTemplates) {
      const col = await detectColumns("email_notification_templates", [
        "rule_key",
        "kind",
        "subject",
        "intro",
        "footer",
        "updated_at",
      ]);
      const idCol = col.rule_key ? "rule_key" : col.kind ? "kind" : null;
      if (idCol) {
        const selectCols = [
          idCol,
          col.subject ? "subject" : null,
          col.intro ? "intro" : null,
          col.footer ? "footer" : null,
          col.updated_at ? "updated_at" : null,
        ]
          .filter(Boolean)
          .join(",");
        const { data } = await admin.from("email_notification_templates").select(selectCols);
        for (const t of data || []) {
          templatesObj[t[idCol]] = { ...t, rule_key: t[idCol] };
        }
      }
    }

    // Defaults de templates: garante que todos aparecem na tela, mesmo que o banco esteja vazio.
    for (const r of baseRules) {
      if (!templatesObj[r.rule_key]) {
        const def = EMAIL_TEMPLATES_DEFAULTS?.[r.rule_key];
        if (def) templatesObj[r.rule_key] = { rule_key: r.rule_key, ...def };
      }
    }

    let logs = [];
    if (hasLogs) {
      const logCols = await detectColumns("email_notification_log", [
        "id",
        "created_at",
        "rule_key",
        "kind",
        "mode",
        "to_email",
        "item_count",
        "status",
      ]);
      const { data } = await admin
        .from("email_notification_log")
        .select(logCols.join(","))
        .order("created_at", { ascending: false })
        .limit(50);
      logs = (data || []).map((l) => ({
        ...l,
        rule_key: l.rule_key || l.kind,
      }));
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
      const col = await detectColumns("email_notification_rules", [
        "rule_key",
        "kind",
        "label",
        "description",
        "is_enabled",
        "cadence",
        "lookback_minutes",
        "config",
        "updated_at",
      ]);
      const idCol = col.rule_key ? "rule_key" : col.kind ? "kind" : null;
      const onConflict = col.rule_key ? "rule_key" : null;

      if (idCol) {
        const rows = stableRules().map((base) => {
          const found = incomingRules.find((r) => r.rule_key === base.rule_key) || {};
          const row = {
            [idCol]: base.rule_key,
            updated_at: new Date().toISOString(),
          };
          if (col.rule_key && col.kind) row.kind = base.rule_key;
          if (col.label) row.label = String(found.label ?? base.label);
          if (col.description) row.description = String(found.description ?? base.description);
          if (col.is_enabled) row.is_enabled = found.is_enabled !== false;
          if (col.cadence) row.cadence = String(found.cadence ?? base.cadence);
          if (col.lookback_minutes) row.lookback_minutes = Number(found.lookback_minutes ?? base.lookback_minutes) || base.lookback_minutes;
          if (col.config) row.config = found.config ?? base.config ?? {};
          return row;
        });

        let upsertRes;
        if (onConflict) {
          upsertRes = await admin.from("email_notification_rules").upsert(rows, { onConflict });
        } else {
          // sem unique/constraint -> faz insert if not exists com update por chave
          for (const r of rows) {
            const key = r[idCol];
            const { data: existing } = await admin.from("email_notification_rules").select("id").eq(idCol, key).limit(1);
            if (existing?.[0]?.id) {
              await admin.from("email_notification_rules").update(r).eq("id", existing[0].id);
            } else {
              await admin.from("email_notification_rules").insert([r]);
            }
          }
          upsertRes = { error: null };
        }
        if (upsertRes?.error) return json(res, 500, { error: upsertRes.error.message });
      }
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
      const col = await detectColumns("email_notification_templates", [
        "rule_key",
        "kind",
        "subject",
        "intro",
        "footer",
        "updated_at",
      ]);
      const idCol = col.rule_key ? "rule_key" : col.kind ? "kind" : null;
      const onConflict = col.rule_key ? "rule_key" : null;
      if (idCol) {
        const baseRules = stableRules();
        const rows = baseRules.map((r) => {
          const t = incomingTemplates?.[r.rule_key] || {};
          const row = {
            [idCol]: r.rule_key,
            updated_at: new Date().toISOString(),
          };
          if (col.rule_key && col.kind) row.kind = r.rule_key;
          if (col.rule_key && !col.kind) {
            // nada
          }
          if (col.subject) row.subject = String(t.subject || EMAIL_TEMPLATES_DEFAULTS?.[r.rule_key]?.subject || "").trim() || null;
          if (col.intro) row.intro = String(t.intro || EMAIL_TEMPLATES_DEFAULTS?.[r.rule_key]?.intro || "").trim() || null;
          if (col.footer) row.footer = String(t.footer || EMAIL_TEMPLATES_DEFAULTS?.[r.rule_key]?.footer || "").trim() || null;
          // garante rule_key não nulo quando existir
          if (col.rule_key) row.rule_key = r.rule_key;
          return row;
        });

        let upsertRes;
        if (onConflict) {
          upsertRes = await admin.from("email_notification_templates").upsert(rows, { onConflict });
        } else {
          for (const r of rows) {
            const key = r[idCol];
            const { data: existing } = await admin.from("email_notification_templates").select("id").eq(idCol, key).limit(1);
            if (existing?.[0]?.id) {
              await admin.from("email_notification_templates").update(r).eq("id", existing[0].id);
            } else {
              await admin.from("email_notification_templates").insert([r]);
            }
          }
          upsertRes = { error: null };
        }
        if (upsertRes?.error) return json(res, 500, { error: upsertRes.error.message });
      }
    }

    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Method not allowed" });
}
