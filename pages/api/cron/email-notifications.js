import { getServerSupabase } from "../../../lib/serverSupabase";
import { getSmtpTransport, getFromAddress, appUrl } from "../../../lib/emailSmtp";

function isoDate(d) { return d.toISOString().slice(0, 10); }

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function stableRules() {
  return [
    { rule_key: "immersion_created", label: "Nova imersão criada (evento)", is_enabled: true, cadence: "event", lookback_minutes: 60 },
    { rule_key: "task_overdue_daily", label: "Tarefas atrasadas (diário)", is_enabled: true },
    { rule_key: "task_due_soon_weekly", label: "Vencendo em até 7 dias (semanal)", is_enabled: true },
    { rule_key: "immersion_risk_daily", label: "Risco de imersão (diário)", is_enabled: true },
  ];
}

function applyPlaceholders(str, vars) {
  let out = String(str || "");
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replaceAll(`{{${k}}}`, String(v ?? ""));
  }
  return out;
}

function renderHtml({ title, intro, footer, items }) {
  const base = appUrl();
  const rows = (items || []).slice(0, 50).map((t) => {
    const immersionName = t.immersions?.immersion_name || t.immersion_name || "-";
    const link = base ? `${base}/imersoes/${t.immersion_id}` : "";
    const linkHtml = link ? ` — <a href="${link}">abrir</a>` : "";
    const due = t.due_date ? ` — prazo: ${t.due_date}` : "";
    return `<li><b>${t.title}</b> (${immersionName})${due}${linkHtml}</li>`;
  }).join("");

  const safeIntro = intro ? `<p>${intro}</p>` : "";
  const safeFooter = footer ? `<p style="margin-top:16px;color:#666">${footer}</p>` : "";

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.45">
    <h2 style="margin:0 0 8px 0">${title}</h2>
    ${safeIntro}
    <ul>${rows || "<li>Nenhum item.</li>"}</ul>
    ${safeFooter}
  </div>`;
}

async function tableExists(supabaseAdmin, name) {
  try {
    const { error } = await supabaseAdmin.from(name).select("*").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function loadConfig(supabaseAdmin) {
  const baseRules = stableRules();

  const hasRules = await tableExists(supabaseAdmin, "email_notification_rules");
  const hasSettings = await tableExists(supabaseAdmin, "email_notification_settings");
  const hasTemplates = await tableExists(supabaseAdmin, "email_notification_templates");

  let rules = baseRules;

  if (hasRules) {
    // Compat: algumas bases usam coluna "kind" como chave primária da regra.
    let data = null;
    {
      const r = await supabaseAdmin
        .from("email_notification_rules")
        .select("rule_key,label,description,rule_text,is_enabled,cadence,lookback_minutes")
        .in("rule_key", baseRules.map((r) => r.rule_key));
      if (!r.error) data = r.data;
    }
    if (!data) {
      const r = await supabaseAdmin
        .from("email_notification_rules")
        .select("kind,label,description,rule_text,is_enabled,cadence,lookback_minutes")
        .in("kind", baseRules.map((r) => r.rule_key));
      if (!r.error) {
        data = (r.data || []).map((row) => ({ ...row, rule_key: row.kind }));
      }
    }
    if (Array.isArray(data) && data.length) {
      const map = new Map(data.map((r) => [r.rule_key, r]));
      rules = baseRules.map((r) => ({ ...r, ...(map.get(r.rule_key) || {}) }));
    }
  }

  let settings = { from_email: "", from_name: "", reply_to: "" };
  if (hasSettings) {
    const { data } = await supabaseAdmin
      .from("email_notification_settings")
      .select("from_email,from_name,reply_to,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (data?.[0]) settings = data[0];
  }

  let templates = {};
  if (hasTemplates) {
    const { data } = await supabaseAdmin
      .from("email_notification_templates")
      .select("rule_key,subject,intro,footer,updated_at");
    for (const t of (data || [])) templates[t.rule_key] = t;
  }

  return { rules, settings, templates };
}

async function logSend(supabaseAdmin, payload) {
  const ok = await tableExists(supabaseAdmin, "email_notification_log");
  if (!ok) return;
  try {
    await supabaseAdmin.from("email_notification_log").insert([payload]);
  } catch {
    // ignore
  }
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || req.headers["x-cron-token"];
    const expected = process.env.CRON_TOKEN;
    if (expected && token !== expected) return res.status(401).json({ ok: false, error: "Token inválido." });

    const enableSend = String(process.env.ENABLE_EMAIL_NOTIFICATIONS || "0") === "1";
    const force = String(req.query?.force || "0") === "1";

    const supabaseAdmin = getServerSupabase();
    const transporter = getSmtpTransport();

    const today = new Date();
    const todayStr = isoDate(today);

    const { rules, settings, templates } = await loadConfig(supabaseAdmin);

    const fromEmail = settings?.from_email || getFromAddress();
    const fromName = settings?.from_name || "";
    const replyTo = settings?.reply_to || "";

    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    // Profiles cache
    const profileCache = new Map();
    async function getProfile(id) {
      if (!id) return null;
      if (profileCache.has(id)) return profileCache.get(id);
      const { data } = await supabaseAdmin.from("profiles").select("id,name,email").eq("id", id).single();
      profileCache.set(id, data || null);
      return data || null;
    }

    let sent = 0;
    let failures = 0;
    const actions = [];

    const rulesMap = new Map((rules || []).map((r) => [r.rule_key, r]));

    const ruleImmersionCreated = rulesMap.get("immersion_created");
    const ruleOverdue = rulesMap.get("task_overdue_daily");
    const ruleDueSoon = rulesMap.get("task_due_soon_weekly");
    const ruleRisk = rulesMap.get("immersion_risk_daily");

    const hasLog = await tableExists(supabaseAdmin, "email_notification_log");

    async function alreadySent({ rule_key, to, subject }) {
      if (!hasLog) return false;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const q = await supabaseAdmin
        .from("email_notification_log")
        .select("id")
        .eq("rule_key", rule_key)
        .eq("to_email", to)
        .eq("subject", subject)
        .gte("created_at", since)
        .limit(1);
      if (q.error) return false;
      return (q.data || []).length > 0;
    }

    // Helper to send + log
    async function sendEmail({ rule_key, to, subject, html, item_count }) {
      const mode = enableSend ? "send" : "preview";
      const payloadBase = {
        rule_key,
        mode,
        to_email: to,
        subject,
        item_count: item_count || 0,
        created_at: new Date().toISOString(),
      };

      if (!to) {
        failures += 1;
        await logSend(supabaseAdmin, { ...payloadBase, status: "skipped", error: "Destinatário ausente" });
        return;
      }

      if (!enableSend) {
        actions.push({ rule_key, to, subject, item_count });
        await logSend(supabaseAdmin, { ...payloadBase, status: "preview" });
        return;
      }

      try {
        await transporter.sendMail({
          from,
          to,
          replyTo: replyTo || undefined,
          subject,
          html,
        });
        sent += 1;
        await logSend(supabaseAdmin, { ...payloadBase, status: "sent" });
      } catch (e) {
        failures += 1;
        await logSend(supabaseAdmin, { ...payloadBase, status: "failed", error: e?.message || "Erro" });
      }
    }

    // RULE 0: immersion_created (event)
    if (ruleImmersionCreated?.is_enabled !== false) {
      const lookback = Number(ruleImmersionCreated?.lookback_minutes || 60);
      const sinceIso = new Date(Date.now() - lookback * 60 * 1000).toISOString();
      const tpl = templates?.immersion_created || {};

      // Best-effort: se sua tabela 'immersions' não tiver created_at, esta regra simplesmente não dispara.
      const { data: newImmersions, error: imErr } = await supabaseAdmin
        .from("immersions")
        .select("id,immersion_name,created_at,educational_consultant,instructional_designer")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(25);

      if (!imErr && Array.isArray(newImmersions) && newImmersions.length) {
        for (const im of newImmersions) {
          const consultant = await getProfile(im?.educational_consultant);
          const designer = await getProfile(im?.instructional_designer);
          const recipients = [consultant, designer].filter((p, idx, arr) => p?.email && arr.findIndex((x) => x?.email === p.email) === idx);

          for (const p of recipients) {
            const subject = renderTemplate(tpl?.subject || "Sparks • Nova imersão criada: \"{{immersion}}\" — {{date}}", {
              count: 1,
              date: todayStr,
              name: p?.name || "",
              app: process.env.APP_URL || "",
              immersion: im?.immersion_name || "",
            });

            if (await alreadySent({ rule_key: "immersion_created", to: p.email, subject })) continue;

            const intro = renderTemplate(tpl?.intro || "Olá {{name}}, uma nova imersão foi criada e já está disponível.", {
              count: 1,
              date: todayStr,
              name: p?.name || "",
              app: process.env.APP_URL || "",
              immersion: im?.immersion_name || "",
            });
            const footer = renderTemplate(tpl?.footer || "Acesse o sistema: {{app}}", {
              count: 1,
              date: todayStr,
              name: p?.name || "",
              app: process.env.APP_URL || "",
              immersion: im?.immersion_name || "",
            });

            const html = makeEmailHtml({ title: subject, intro, rows: [], footer });
            await sendEmail({ rule_key: "immersion_created", to: p.email, subject, html, item_count: 1 });
          }
        }
      }
    }

    // RULE 1: task_overdue_daily
    if (rulesMap.get("task_overdue_daily")?.is_enabled !== false) {
      const { data: overdue, error: oErr } = await supabaseAdmin
        .from("immersion_tasks")
        .select("id,title,due_date,status,responsible_id,immersion_id,immersions(immersion_name)")
        .neq("status", "Concluída")
        .not("due_date", "is", null)
        .lt("due_date", todayStr);

      if (oErr) throw oErr;

      const groups = new Map();
      for (const t of (overdue || [])) {
        if (!t.responsible_id) continue;
        const arr = groups.get(t.responsible_id) || [];
        arr.push(t);
        groups.set(t.responsible_id, arr);
      }

      for (const [responsibleId, items] of groups.entries()) {
        const p = await getProfile(responsibleId);
        if (!p?.email) continue;

        const tpl = templates?.task_overdue_daily || {};
        const vars = { count: items.length, date: todayStr, name: p.name || "", app: appUrl() };

        const subject = applyPlaceholders(tpl.subject || `Sparks • {{count}} tarefa(s) atrasada(s) — {{date}}`, vars);
        const intro = applyPlaceholders(tpl.intro || `Olá {{name}}, você tem tarefas atrasadas.`, vars);
        const footer = applyPlaceholders(tpl.footer || `Acesse: {{app}}`, vars);

        const html = renderHtml({
          title: subject,
          intro,
          footer,
          items,
        });

        await sendEmail({ rule_key: "task_overdue_daily", to: p.email, subject, html, item_count: items.length });
      }
    }

    // RULE 2: task_due_soon_weekly (Segunda-feira)
    const isMonday = today.getDay() === 1;
    if ((force || isMonday) && rulesMap.get("task_due_soon_weekly")?.is_enabled !== false) {
      const maxDate = isoDate(addDays(today, 7));
      const { data: dueSoon, error } = await supabaseAdmin
        .from("immersion_tasks")
        .select("id,title,due_date,status,responsible_id,immersion_id,immersions(immersion_name)")
        .neq("status", "Concluída")
        .not("due_date", "is", null)
        .gte("due_date", todayStr)
        .lte("due_date", maxDate);

      if (error) throw error;

      const groups = new Map();
      for (const t of (dueSoon || [])) {
        if (!t.responsible_id) continue;
        const arr = groups.get(t.responsible_id) || [];
        arr.push(t);
        groups.set(t.responsible_id, arr);
      }

      for (const [responsibleId, items] of groups.entries()) {
        const p = await getProfile(responsibleId);
        if (!p?.email) continue;

        const tpl = templates?.task_due_soon_weekly || {};
        const vars = { count: items.length, date: todayStr, name: p.name || "", app: appUrl() };

        const subject = applyPlaceholders(tpl.subject || `Sparks • {{count}} tarefa(s) vencem em até 7 dias — {{date}}`, vars);
        const intro = applyPlaceholders(tpl.intro || `Olá {{name}}, estas tarefas vencem em breve (próximos 7 dias):`, vars);
        const footer = applyPlaceholders(tpl.footer || `Acesse: {{app}}`, vars);

        const html = renderHtml({ title: subject, intro, footer, items });
        await sendEmail({ rule_key: "task_due_soon_weekly", to: p.email, subject, html, item_count: items.length });
      }
    }

    // RULE 3: immersion_risk_daily
    if (rulesMap.get("immersion_risk_daily")?.is_enabled !== false) {
      // Carrega imersões ativas com consultor
      const { data: immersions, error: iErr } = await supabaseAdmin
        .from("immersions")
        .select("id,immersion_name,status,educational_consultant")
        .neq("status", "Concluída");
      if (iErr) throw iErr;

      // Tarefas atrasadas por imersão
      const { data: overdue, error: oErr } = await supabaseAdmin
        .from("immersion_tasks")
        .select("id,title,due_date,status,immersion_id")
        .neq("status", "Concluída")
        .not("due_date", "is", null)
        .lt("due_date", todayStr);

      if (oErr) throw oErr;

      const byImm = new Map();
      for (const t of (overdue || [])) {
        const arr = byImm.get(t.immersion_id) || [];
        arr.push(t);
        byImm.set(t.immersion_id, arr);
      }

      for (const imm of (immersions || [])) {
        const items = byImm.get(imm.id) || [];
        if (!items.length) continue;

        // Heurística de risco:
        // - >=5 atrasadas => risco
        // - ou >=3 atrasadas e status "Em andamento" => risco
        const risky = items.length >= 5 || (items.length >= 3 && String(imm.status || "").toLowerCase().includes("andamento"));
        if (!risky) continue;

        const p = await getProfile(imm.educational_consultant);
        if (!p?.email) continue;

        const tpl = templates?.immersion_risk_daily || {};
        const vars = { count: items.length, date: todayStr, name: p.name || "", app: appUrl() };

        const subject = applyPlaceholders(
          tpl.subject || `Sparks • Risco na imersão "${imm.immersion_name}" — {{count}} atrasadas`,
          vars
        );
        const intro = applyPlaceholders(
          tpl.intro || `Olá {{name}}, a imersão "${imm.immersion_name}" está com atrasos relevantes. Priorize as entregas abaixo:`,
          { ...vars }
        );
        const footer = applyPlaceholders(tpl.footer || `Acesse: {{app}}`, vars);

        // enrich items with immersion name
        const enriched = items.map((t) => ({ ...t, immersion_name: imm.immersion_name }));
        const html = renderHtml({ title: subject, intro, footer, items: enriched });

        await sendEmail({ rule_key: "immersion_risk_daily", to: p.email, subject, html, item_count: items.length });
      }
    }

    return res.status(200).json({
      ok: true,
      mode: enableSend ? "send" : "preview",
      preview_count: actions.length,
      sent,
      failures,
      rules_enabled: rules.filter((r) => r.is_enabled !== false).map((r) => r.rule_key),
      note: "Regras ativas: task_overdue_daily (diário), task_due_soon_weekly (segunda), immersion_risk_daily (diário). Use ?force=1 para forçar semanal.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro" });
  }
}
