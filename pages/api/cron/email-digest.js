import { getServerSupabase } from "../../../lib/serverSupabase";
import { getSmtpTransport, getFromAddress, appUrl } from "../../../lib/emailSmtp";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function classify(dueDateStr, today) {
  if (!dueDateStr) return "Sem prazo";
  const due = new Date(dueDateStr + "T00:00:00");
  const t = new Date(isoDate(today) + "T00:00:00");
  const diff = Math.floor((due.getTime() - t.getTime()) / (24 * 3600 * 1000));
  if (diff < 0) return "Atrasada";
  if (diff === 0) return "Vence hoje";
  return `Vence em ${diff} dia(s)`;
}

function renderHtml({ name, items }) {
  const base = appUrl();
  const rows = items
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
    .map((t) => {
      const label = classify(t.due_date, new Date());
      const immersionName = t.immersions?.name || "-";
      const link = base ? `${base}/imersoes/${t.immersion_id}` : "";
      const linkHtml = link ? ` — <a href="${link}">abrir imersão</a>` : "";
      return `<li><b>${t.title}</b> (${immersionName}) — prazo: ${t.due_date} — <i>${label}</i>${linkHtml}</li>`;
    })
    .join("");

  return `
  <div style="font-family: Arial, sans-serif; line-height:1.4">
    <p>Olá${name ? `, ${name}` : ""}.</p>
    <p>Resumo de tarefas com prazo até os próximos 7 dias:</p>
    <ul>${rows}</ul>
    <p>Atualize o status e inclua evidências no sistema.</p>
  </div>`;
}

export default async function handler(req, res) {
  // Proteção simples: só permite execução com token
  const token = req.headers["x-cron-token"] || req.query.token;
  if (process.env.CRON_TOKEN && token !== process.env.CRON_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const supabaseAdmin = getServerSupabase();
    const transporter = getSmtpTransport();
    const from = getFromAddress();

    const today = new Date();
    const soonStr = isoDate(new Date(today.getTime() + 7 * 24 * 3600 * 1000));

    const { data: tasks, error } = await supabaseAdmin
      .from("immersion_tasks")
      .select("id, title, due_date, status, responsible_id, immersion_id, immersions(immersion_name)")
      .neq("status", "Concluída")
      .not("due_date", "is", null)
      .lte("due_date", soonStr);

    if (error) throw error;

    // Agrupar por responsável (somente tarefas com responsible_id)
    const map = new Map();
    for (const t of tasks || []) {
      if (!t.responsible_id) continue;
      const arr = map.get(t.responsible_id) || [];
      arr.push(t);
      map.set(t.responsible_id, arr);
    }

    const responsibleIds = Array.from(map.keys());
    if (responsibleIds.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, note: "Nenhuma tarefa com responsável." });
    }

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name")
      .in("id", responsibleIds);
    if (pErr) throw pErr;

    const byId = new Map((profiles || []).map((p) => [p.id, p]));

    let sent = 0;
    const failures = [];

    for (const [rid, list] of map.entries()) {
      const p = byId.get(rid);
      if (!p?.email) continue;

      const html = renderHtml({ name: p.name, items: list });
      const subject = "Sparks — resumo de tarefas (próximos 7 dias)";

      try {
        await transporter.sendMail({ from, to: p.email, subject, html });
        sent += 1;
      } catch (e) {
        failures.push({ email: p.email, error: e?.message || "Erro" });
      }
    }

    return res.status(200).json({ ok: true, sent, failures });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Erro" });
  }
}
