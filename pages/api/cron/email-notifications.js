import { getServerSupabase } from "../../../lib/serverSupabase";
import { getSmtpTransport, getFromAddress, appUrl } from "../../../lib/emailSmtp";

function isoDate(d) { return d.toISOString().slice(0, 10); }

function renderHtml({ title, intro, items }) {
  const base = appUrl();
  const rows = (items || []).slice(0, 50).map((t) => {
    const immersionName = t.immersions?.immersion_name || "-";
    const link = base ? `${base}/imersoes/${t.immersion_id}` : "";
    const linkHtml = link ? ` — <a href="${link}">abrir</a>` : "";
    return `<li><b>${t.title}</b> (${immersionName}) — prazo: ${t.due_date}${linkHtml}</li>`;
  }).join("");

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.4">
    <h3>${title}</h3>
    <p>${intro}</p>
    <ul>${rows}</ul>
  </div>`;
}

export default async function handler(req, res) {
  const token = req.headers["x-cron-token"] || req.query.token;
  if (process.env.CRON_TOKEN && token !== process.env.CRON_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const enableSend = process.env.ENABLE_EMAIL_NOTIFICATIONS === "1";

  try {
    const supabaseAdmin = getServerSupabase();
    const transporter = enableSend ? getSmtpTransport() : null;
    const from = enableSend ? getFromAddress() : null;

    const today = new Date();
    const todayStr = isoDate(today);
    const soonStr = isoDate(new Date(today.getTime() + 7 * 24 * 3600 * 1000));

    // Regras (preview):
    // 1) task_overdue_daily: tarefas atrasadas por responsável
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

    const actions = [];
    for (const [rid, list] of groups.entries()) {
      const p = byId.get(rid);
      if (!p?.email) continue;
      actions.push({
        rule_key: "task_overdue_daily",
        to: p.email,
        subject: "Sparks — tarefas atrasadas",
        html: renderHtml({
          title: "Tarefas atrasadas",
          intro: "Você tem tarefas com prazo vencido. Atualize status e evidências no sistema.",
          items: list,
        }),
      });
    }

    let sent = 0;
    const failures = [];
    if (enableSend) {
      for (const a of actions) {
        try {
          await transporter.sendMail({ from, to: a.to, subject: a.subject, html: a.html });
          sent += 1;
        } catch (e) {
          failures.push({ to: a.to, error: e?.message || "Erro" });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      mode: enableSend ? "send" : "preview",
      preview_count: actions.length,
      sent,
      failures,
      note: "Regras completas (due_soon_weekly, immersion_risk_daily) serão ativadas após validação de produto.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro" });
  }
}
