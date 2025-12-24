import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel)." );
}

function toLocalDateOnly(d) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export async function getDashboardStats() {
  ensure();

  // 1) Imersões
  const { data: imms, error: immsErr } = await supabase
    .from("immersions")
    .select("id, immersion_name, start_date, end_date, room_location, status, created_at")
    .order("start_date", { ascending: true });

  if (immsErr) throw immsErr;

  // 2) Tarefas (Checklist)
  const { data: tasks, error: tasksErr } = await supabase
    .from("immersion_tasks")
    .select("id, immersion_id, status, due_date");

  if (tasksErr) throw tasksErr;

  const totalImmersions = (imms || []).length;
  const totalTasks = (tasks || []).length;
  const doneTasks = (tasks || []).filter((t) => t.status === "Concluída").length;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const lateTasks = (tasks || []).filter((t) => {
    if (!t.due_date) return false;
    if (t.status === "Concluída") return false;
    const due = toLocalDateOnly(t.due_date);
    return due && due.getTime() < today.getTime();
  }).length;

  // Próximas (ordena por data e mantém só as que ainda não começaram ou recentes)
  const tasksByImmersion = new Map();
  for (const t of tasks || []) {
    const k = t.immersion_id;
    tasksByImmersion.set(k, (tasksByImmersion.get(k) || 0) + 1);
  }

  const upcoming = (imms || [])
    .slice()
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(0, 10)
    .map((i) => ({ ...i, total_tasks: tasksByImmersion.get(i.id) || 0 }));

  return {
    stats: {
      totalImmersions,
      totalTasks,
      doneTasks,
      lateTasks
    },
    upcoming
  };
}
