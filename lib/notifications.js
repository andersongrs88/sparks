import { supabase } from "./supabaseClient";
import { isAreaRole } from "./permissions";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function classifyTask(task, today) {
  if (!task?.due_date) return "no_due";
  const due = new Date(task.due_date + "T00:00:00");
  const t = new Date(today.toISOString().slice(0, 10) + "T00:00:00");
  const diffDays = Math.floor((due.getTime() - t.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "soon";
  return "later";
}

export async function listNotificationTasks({ user, profile, isFullAccess, immersionId = null }) {
  ensure();
  if (!user) return [];

  const today = new Date();
  const todayStr = isoDate(today);
  const soonStr = isoDate(new Date(today.getTime() + 7 * 24 * 3600 * 1000));

  let q = supabase
    .from("immersion_tasks")
    .select("id, immersion_id, phase, area, title, responsible_id, due_date, status, evidence_link, evidence_path, created_at, immersions(name)")
    .neq("status", "Concluída")
    .not("due_date", "is", null)
    .lte("due_date", soonStr);

  // Escopo por usuário/área
  const role = profile?.role;
  if (isAreaRole(role)) {
    q = q.eq("area", role);
  } else if (isFullAccess) {
    // Para full access, notificações pessoais por responsabilidade
    q = q.eq("responsible_id", user.id);
  } else {
    // viewer/outros: só leitura, mas sem área definida; mostra nada (evita ruído)
    q = q.eq("responsible_id", user.id);
  }

  if (immersionId) q = q.eq("immersion_id", immersionId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getNotificationSummary(opts) {
  const items = await listNotificationTasks(opts);
  const today = new Date();
  const summary = { overdue: 0, today: 0, soon: 0, total: 0, items: [] };

  for (const t of items) {
    const bucket = classifyTask(t, today);
    if (bucket === "overdue") summary.overdue += 1;
    if (bucket === "today") summary.today += 1;
    if (bucket === "soon") summary.soon += 1;
  }
  summary.total = summary.overdue + summary.today + summary.soon;
  summary.items = items;
  return summary;
}
