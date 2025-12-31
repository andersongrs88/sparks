import { getServerSupabase } from "../../../lib/serverSupabase";
import { getSmtpTransport, getFromAddress, appUrl } from "../../../lib/emailSmtp";

function isoDate(d) { return d.toISOString().slice(0, 10); }

function replaceVars(str, vars) {
  let out = String(str || "");
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replaceAll(`{{${k}}}`, v == null ? "" : String(v));
  }
  return out;
}

function renderHtml({ title, intro, footer, items }) {
  const base = appUrl();
  const rows = (items || []).slice(0, 60).map((t) => {
    const immersionName = t.immersions?.immersion_name || t.immersion_name || "-";
    const link = base && t.immersion_id ? `${base}/imersoes/${t.immersion_id}` : "";
    const linkHtml = link ? ` — <a href="${link}">abrir</a>` : "";
    const due = t.due_date ? `prazo: ${t.due_date}` : "";
    return `<li><b>${t.title}</b> (${immersionName}) ${due}${linkHtml}</li>`;
  }).join("");

  const footerHtml = footer ? `<p style="margin-top:16px;color:#6b7280">${footer}</p>` : "";

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h2 style="margin:0 0 8px 0">${title}</h2>
    ${intro ? `<p>${intro}</p>` : ""}
    <ul>${rows}</ul>
    ${footerHtml}
  </div>`;
}

async function logSend(supabaseAdmin, payload) {
  try {
    await supabaseAdmin.from("email_notification_log").insert({
      kind: payload.kind,
      to_email: payload.to_email || null,
      subject: payload.subject || null,
      item_count: payload.item_count || 0,
      mode: payload.mode || "preview",
      status: payload.status || "ok",
      error: payload.error || null,
    });
  } catch (e) {
    // não derruba o cron por falha de log
    console.warn("email_notification_log insert failed:", e?.message || e);
  }
}

async function wasRecentlySent({ supabaseAdmin, kind, to_email, lookback_minutes }) {
  if (!to_email || !lookback_minutes) return false;
  try {
    const since = new Date(Date.now() - Number(lookback_minutes) * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("email_notification_log")
      .select("id")
      .eq("kind", kind)
      .eq("to_email", to_email)
      .gte("created_at", since)
      .limit(1);
    if (error) return false;
    return (data || []).length > 0;
  } catch {
    return false;
  }
}

async function loadTemplate(supabaseAdmin, kind) {
  const defaults = {
    task_overdue_daily: {
      subject: "Sparks • {{count}} tarefa(s) atrasada(s) — {{date}}",
      intro: "Olá {{name}}, você tem tarefas atrasadas. Priorize as entregas listadas abaixo:",
      footer: "Acesse: {{app}}",
    },
    task_due_soon_weekly: {
      subject: "Sparks • {{count}} tarefa(s) vencem em até 7 dias — {{date}}",
      intro: "Olá {{name}}, estas tarefas vencem em breve (próximos 7 dias):",
      footer: "Acesse: {{app}}",
    },
    immersion_risk_daily: {
      subject: "Sparks • Risco na imersão \"{{immersion}}\" — {{count}} atrasadas",
      intro: "Olá {{name}}, a imersão está com atrasos relevantes. Priorize as entregas abaixo:",
      footer: "Acesse: {{app}}",
    },
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("email_notification_templates")
      .select("kind,subject,intro,footer")
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    const d = defaults[kind] || {};
    return {
      subject: data?.subject ?? d.subject ?? "",
      intro: data?.intro ?? d.intro ?? "",
      footer: data?.footer ?? d.footer ?? "",
    };
  } catch {
    return defaults[kind] || { subject: "", intro: "", footer: "" };
  }
}

async function loadSettings(supabaseAdmin) {
  try {
    const { data, error } = await supabaseAdmin
      .from("email_notification_settings")
      .select("from_email,from_name,reply_to,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || {};
  } catch {
    return {};
  }
}

function shouldRunRule({ cadence, now, force }) {
  if (force) return true;
  const c = String(cadence || "").toLowerCase();
  if (c === "daily") return true;
  if (c === "weekly") {
    // por padrão: segunda-feira
    const day = now.getDay(); // 0 domingo
    return day === 1;
  }
  // fallback para schemas antigos
  if (c === "event") return true;
  return true;
}

export default async function handler(req, res) {
  try {
    const token = req.query?.token || req.headers["x-cron-token"] || "";
    const expected = process.env.CRON_TOKEN || "";
    if (expected && token !== expected) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const force = String(req.query?.force || "") === "1";
    const enableSend = String(req.query?.send || "") === "1";

    const supabaseAdmin = getServerSupabase();

    const now = new Date();
    const todayStr = isoDate(now);

    const { data: rules, error: rErr } = await supabaseAdmin
      .from("email_notification_rules")
      .select("kind,is_enabled,cadence,lookback_minutes")
      .eq("is_enabled", true);
    if (rErr) throw rErr;

    const settings = await loadSettings(supabaseAdmin);

    const fromFallback = getFromAddress();
    const fromEmail = settings?.from_email || fromFallback;
    const fromName = settings?.from_name || "Sparks";
    const replyTo = settings?.reply_to || undefined;

    const transport = enableSend ? getSmtpTransport() : null;

    const results = [];
    let sent = 0;
    let failures = 0;

    for (const rule of (rules || [])) {
      const kind = String(rule.kind || "");
      const cadence = rule.cadence;
      const lookback_minutes = Number(rule.lookback_minutes || 0);

      if (!kind) continue;
      if (!shouldRunRule({ cadence, now, force })) continue;

      if (kind === "task_overdue_daily") {
        // Tarefas vencidas (due_date < hoje), agrupadas por responsável
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

        const ids = Array.from(groups.keys());
        const { data: profiles, error: pErr } = ids.length
          ? await supabaseAdmin.from("profiles").select("id,email,name").in("id", ids)
          : { data: [], error: null };
        if (pErr) throw pErr;

        const byId = new Map((profiles || []).map((p) => [p.id, p]));
        const tpl = await loadTemplate(supabaseAdmin, kind);

        for (const [rid, list] of groups.entries()) {
          const p = byId.get(rid);
          if (!p?.email) continue;

          const recently = await wasRecentlySent({ supabaseAdmin, kind, to_email: p.email, lookback_minutes });
          if (recently) continue;

          const vars = { count: list.length, date: todayStr, name: p.name || "", app: appUrl() || "" };
          const subject = replaceVars(tpl.subject, vars);
          const intro = replaceVars(tpl.intro, vars);
          const footer = replaceVars(tpl.footer, vars);

          const html = renderHtml({ title: "Tarefas atrasadas", intro, footer, items: list });
          const action = { kind, to: p.email, subject, count: list.length };

          if (enableSend) {
            try {
              await transport.sendMail({
                from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
                to: p.email,
                subject,
                html,
                replyTo,
              });
              sent += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "ok" });
            } catch (e) {
              failures += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "fail", error: e?.message || "Falha" });
            }
          } else {
            await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "preview", status: "ok" });
          }

          results.push(action);
        }
      }

      if (kind === "task_due_soon_weekly") {
        // Tarefas vencendo em até 7 dias (>= hoje e <= hoje+7), agrupadas por responsável
        const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const endStr = isoDate(end);

        const { data: soon, error: sErr } = await supabaseAdmin
          .from("immersion_tasks")
          .select("id,title,due_date,status,responsible_id,immersion_id,immersions(immersion_name)")
          .neq("status", "Concluída")
          .not("due_date", "is", null)
          .gte("due_date", todayStr)
          .lte("due_date", endStr);
        if (sErr) throw sErr;

        const groups = new Map();
        for (const t of (soon || [])) {
          if (!t.responsible_id) continue;
          const arr = groups.get(t.responsible_id) || [];
          arr.push(t);
          groups.set(t.responsible_id, arr);
        }

        const ids = Array.from(groups.keys());
        const { data: profiles, error: pErr } = ids.length
          ? await supabaseAdmin.from("profiles").select("id,email,name").in("id", ids)
          : { data: [], error: null };
        if (pErr) throw pErr;

        const byId = new Map((profiles || []).map((p) => [p.id, p]));
        const tpl = await loadTemplate(supabaseAdmin, kind);

        for (const [rid, list] of groups.entries()) {
          const p = byId.get(rid);
          if (!p?.email) continue;

          const recently = await wasRecentlySent({ supabaseAdmin, kind, to_email: p.email, lookback_minutes });
          if (recently) continue;

          const vars = { count: list.length, date: todayStr, name: p.name || "", app: appUrl() || "" };
          const subject = replaceVars(tpl.subject, vars);
          const intro = replaceVars(tpl.intro, vars);
          const footer = replaceVars(tpl.footer, vars);

          const html = renderHtml({ title: "Vencendo em breve", intro, footer, items: list });
          const action = { kind, to: p.email, subject, count: list.length };

          if (enableSend) {
            try {
              await transport.sendMail({
                from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
                to: p.email,
                subject,
                html,
                replyTo,
              });
              sent += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "ok" });
            } catch (e) {
              failures += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "fail", error: e?.message || "Falha" });
            }
          } else {
            await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "preview", status: "ok" });
          }

          results.push(action);
        }
      }

      if (kind === "immersion_risk_daily") {
        // Risco: imersões com muitas tarefas atrasadas (threshold simples)
        const THRESHOLD = 5;

        const { data: overdue, error: oErr } = await supabaseAdmin
          .from("immersion_tasks")
          .select("id,title,due_date,status,responsible_id,immersion_id,immersions(id,immersion_name,educational_consultant)")
          .neq("status", "Concluída")
          .not("due_date", "is", null)
          .lt("due_date", todayStr);
        if (oErr) throw oErr;

        // agrupar por imersão
        const byImm = new Map();
        for (const t of (overdue || [])) {
          if (!t.immersion_id) continue;
          const arr = byImm.get(t.immersion_id) || [];
          arr.push(t);
          byImm.set(t.immersion_id, arr);
        }

        // para cada imersão com atraso >= threshold, tentar mapear consultor (nome) -> profile.email
        const tpl = await loadTemplate(supabaseAdmin, kind);

        for (const [immId, list] of byImm.entries()) {
          if ((list?.length || 0) < THRESHOLD) continue;

          const imm = list[0]?.immersions;
          const immersionName = imm?.immersion_name || "Imersão";
          const consultantName = imm?.educational_consultant || "";

          if (!consultantName) continue;

          // tentativa por match de nome (case-insensitive). Se falhar, não envia.
          const { data: p, error: pErr } = await supabaseAdmin
            .from("profiles")
            .select("id,email,name")
            .ilike("name", consultantName)
            .limit(1)
            .maybeSingle();
          if (pErr) throw pErr;
          if (!p?.email) continue;

          const recently = await wasRecentlySent({ supabaseAdmin, kind, to_email: p.email, lookback_minutes });
          if (recently) continue;

          const vars = {
            count: list.length,
            date: todayStr,
            name: p.name || consultantName,
            app: appUrl() || "",
            immersion: immersionName,
          };

          const subject = replaceVars(tpl.subject, vars);
          const intro = replaceVars(tpl.intro, vars);
          const footer = replaceVars(tpl.footer, vars);

          const html = renderHtml({ title: `Risco: ${immersionName}`, intro, footer, items: list });
          const action = { kind, to: p.email, subject, count: list.length, immersion: immersionName };

          if (enableSend) {
            try {
              await transport.sendMail({
                from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
                to: p.email,
                subject,
                html,
                replyTo,
              });
              sent += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "ok" });
            } catch (e) {
              failures += 1;
              await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "send", status: "fail", error: e?.message || "Falha" });
            }
          } else {
            await logSend(supabaseAdmin, { kind, to_email: p.email, subject, item_count: list.length, mode: "preview", status: "ok" });
          }

          results.push(action);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      mode: enableSend ? "send" : "preview",
      sent,
      failures,
      actions: results.slice(0, 100),
      note: "Use ?send=1 para enviar e ?force=1 para ignorar cadência. Use CRON_TOKEN.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro" });
  }
}
