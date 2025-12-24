import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

function toLocalDateOnly(d) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a, b) {
  const da = toLocalDateOnly(a);
  const db = toLocalDateOnly(b);
  if (!da || !db) return 0;
  const diff = da.getTime() - db.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export async function getDashboardStats() {
  ensure();

  const { data: immersions, error: errImm } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, status")
    .order("start_date", { ascending: false });
  if (errImm) throw errImm;

  const { data: tasks, error: errTasks } = await supabase
    .from("immersion_tasks")
    .select("id, immersion_id, status, due_date, done_at");
  if (errTasks) throw errTasks;

  const totalImmersions = immersions?.length || 0;
  const totalTasks = tasks?.length || 0;

  const today = toLocalDateOnly(new Date());

  const doneTasks = (tasks || []).filter((t) => t.status === "Concluída").length;
  const lateTasks = (tasks || []).filter((t) => {
    if (!t?.due_date) return false;
    if (t.status === "Concluída") return false;
    const due = toLocalDateOnly(t.due_date);
    return due && today && due.getTime() < today.getTime();
  }).length;

  const tasksByImmersion = new Map();
  for (const t of tasks || []) {
    tasksByImmersion.set(t.immersion_id, (tasksByImmersion.get(t.immersion_id) || 0) + 1);
  }

  const upcoming = (immersions || [])
    .slice()
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(0, 10)
    .map((i) => ({ ...i, total_tasks: tasksByImmersion.get(i.id) || 0 }));

  const { data: overdue, error: errOver } = await supabase
    .from("immersion_tasks")
    .select("id, title, phase, status, due_date, immersion_id, immersions(immersion_name, status)")
    .neq("status", "Concluída")
    .not("due_date", "is", null)
    .order("due_date", { ascending: true })
    .limit(80);
  if (errOver) throw errOver;

  const overdueList = (overdue || [])
    .filter((t) => {
      const due = toLocalDateOnly(t.due_date);
      return due && today && due.getTime() < today.getTime();
    })
    .map((t) => ({
      id: t.id,
      title: t.title,
      phase: t.phase,
      status: t.status,
      due_date: t.due_date,
      immersion_id: t.immersion_id,
      immersion_name: t.immersions?.name || "-",
      immersion_status: t.immersions?.status || "-",
      days_late: daysBetween(today, t.due_date)
    }));

  return {
    stats: { totalImmersions, totalTasks, doneTasks, lateTasks },
    upcoming,
    overdue: overdueList
  };
}
