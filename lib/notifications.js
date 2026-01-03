import { supabase } from "./supabaseClient";

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

export async function listNotificationTasks({ user, immersionId = null, isFullAccess = false }) {
  ensure();

  // NoAuth/MVP: quando não há usuário autenticado, mostramos notificações globais.
  // Com Auth: filtramos por responsável quando possível.
  const userId = user?.id || null;

  // Para perfis com acesso total (ex.: admin/consultor), mostramos o painel global (sem filtro por responsável).
  const shouldFilterByOwner = !!userId && !isFullAccess;

  const today = new Date();
  const soonStr = isoDate(new Date(today.getTime() + 7 * 24 * 3600 * 1000));

  // Importante: o schema pode variar (ex.: colunas responsible_id / evidence_link podem não existir em bases antigas).
  // Estratégia: tentar com filtro por responsável; se falhar por coluna ausente, degradar para "tarefas da semana".
  const baseSelect = "id, immersion_id, phase, title, due_date, status, created_at, immersions(immersion_name)";

  async function run(withOwnerFilter) {
    let q = supabase
      .from("immersion_tasks")
      .select(withOwnerFilter ? `${baseSelect}, responsible_id` : baseSelect)
      .neq("status", "Concluída")
      .not("due_date", "is", null)
      .lte("due_date", soonStr);

    if (withOwnerFilter && userId) q = q.eq("responsible_id", userId);
    if (immersionId) q = q.eq("immersion_id", immersionId);

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  try {
    return await run(shouldFilterByOwner);
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.includes("responsible_id") && msg.includes("does not exist")) {
      return await run(false);
    }
    throw err;
  }
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
