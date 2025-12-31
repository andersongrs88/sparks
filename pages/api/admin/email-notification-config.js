import { createClient } from "@supabase/supabase-js";

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function requireAdmin({ url, anonKey, token }) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data: u, error: uErr } = await anon.auth.getUser(token);
  if (uErr) throw uErr;
  const userId = u?.user?.id;
  if (!userId) throw new Error("Sessão inválida.");

  const { data: profile, error: pErr } = await anon
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw pErr;

  if (!profile?.is_active || profile?.role !== "admin") {
    const e = new Error("Apenas ADMIN pode acessar esta configuração.");
    e.statusCode = 403;
    throw e;
  }

  return { userId };
}

/**
 * GET  /api/admin/email-notification-config
 * POST /api/admin/email-notification-config
 *
 * Banco (compatível com base atual):
 * - email_notification_rules: id, is_enabled, kind, cadence, lookback_minutes
 * - email_notification_settings: from_email, from_name, reply_to
 * - email_notification_templates: kind (pk), subject, intro, footer
 * - email_notification_log: created_at, kind, to_email, subject, item_count, mode, status, error
 */
export default async function handler(req, res) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) return json(res, 500, { error: "Supabase não configurado." });
  if (!serviceKey) return json(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: "Token ausente." });

  try {
    await requireAdmin({ url, anonKey, token });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    if (req.method === "GET") {
      const { data: rules, error: rErr } = await admin
        .from("email_notification_rules")
        .select("id,kind,is_enabled,cadence,lookback_minutes,created_at")
        .order("kind", { ascending: true });
      if (rErr) throw rErr;

      const { data: settings, error: sErr } = await admin
        .from("email_notification_settings")
        .select("id,from_email,from_name,reply_to,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sErr) throw sErr;

      const { data: templates, error: tErr } = await admin
        .from("email_notification_templates")
        .select("kind,subject,intro,footer,updated_at");
      if (tErr) throw tErr;

      const { data: logs, error: lErr } = await admin
        .from("email_notification_log")
        .select("id,created_at,kind,to_email,subject,item_count,mode,status,error")
        .order("created_at", { ascending: false })
        .limit(50);
      if (lErr) throw lErr;

      return json(res, 200, { ok: true, rules: rules || [], settings: settings || null, templates: templates || [], logs: logs || [] });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const clean = (v) => (v == null ? null : String(v));

      const settingsIn = body.settings || {};
      const rulesIn = Array.isArray(body.rules) ? body.rules : [];
      const templatesIn = Array.isArray(body.templates) ? body.templates : [];

      // 1) upsert settings (singleton)
      if (settingsIn && (settingsIn.from_email || settingsIn.from_name || settingsIn.reply_to)) {
        const payload = {
          from_email: clean(settingsIn.from_email)?.trim() || null,
          from_name: clean(settingsIn.from_name)?.trim() || null,
          reply_to: clean(settingsIn.reply_to)?.trim() || null,
          updated_at: new Date().toISOString()
        };

        const { error: upErr } = await admin
          .from("email_notification_settings")
          .upsert(payload, { onConflict: "id" }); // se não existir, insere; se existir, cria novo row (ok)
        if (upErr) throw upErr;
      }

      // 2) update rules enabled/cadence/lookback
      for (const r of rulesIn) {
        const kind = String(r?.kind || "").trim();
        if (!kind) continue;
        const patch = {};
        if (typeof r.is_enabled === "boolean") patch.is_enabled = r.is_enabled;
        if (r.cadence) patch.cadence = String(r.cadence);
        if (r.lookback_minutes != null && !Number.isNaN(Number(r.lookback_minutes))) patch.lookback_minutes = Number(r.lookback_minutes);

        if (Object.keys(patch).length) {
          const { error: uErr } = await admin.from("email_notification_rules").update(patch).eq("kind", kind);
          if (uErr) throw uErr;
        }
      }

      // 3) upsert templates (by kind)
      for (const t of templatesIn) {
        const kind = String(t?.kind || "").trim();
        if (!kind) continue;
        const payload = {
          kind,
          subject: clean(t.subject) || null,
          intro: clean(t.intro) || null,
          footer: clean(t.footer) || null,
          updated_at: new Date().toISOString()
        };
        const { error: te } = await admin.from("email_notification_templates").upsert(payload, { onConflict: "kind" });
        if (te) throw te;
      }

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    const status = e?.statusCode || 500;
    return json(res, status, { ok: false, error: e?.message || "Erro" });
  }
}
