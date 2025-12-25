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

  // Keep select aligned with schema variants (older bases may not have all columns).
  // We request responsible_id for workload and orphan detection; if it doesn't exist,
  // we fall back gracefully.
  async function fetchTasks(withOwner) {
    const { data, error } = await supabase
      .from("immersion_tasks")
      .select(withOwner ? "id, immersion_id, status, due_date, done_at, phase, responsible_id" : "id, immersion_id, status, due_date, done_at, phase");
    if (error) throw error;
    return data ?? [];
  }

  let tasks = [];
  try {
    tasks = await fetchTasks(true);
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg.includes("responsible_id") && msg.includes("does not exist")) {
      tasks = await fetchTasks(false);
    } else {
      throw e;
    }
  }

  const totalImmersions = immersions?.length || 0;
  const totalTasks = tasks?.length || 0;

  const today = toLocalDateOnly(new Date());

  // Robustez: bases podem usar "Concluida" (sem acento) e/ou preencher done_at.
  const doneTasks = (tasks || []).filter((t) => t.status === "Concluída" || t.status === "Concluida" || !!t.done_at).length;
  const lateTasks = (tasks || []).filter((t) => {
    if (!t?.due_date) return false;
    if (t.status === "Concluída" || t.status === "Concluida" || !!t.done_at) return false;
    const due = toLocalDateOnly(t.due_date);
    return due && today && due.getTime() < today.getTime();
  }).length;

  // Próxima ação por imersão: menor prazo dentre tarefas abertas (fallback: primeira tarefa aberta).
  const nextActionByImm = new Map();
  for (const t of tasks || []) {
    if (t.status === "Concluída" || t.status === "Concluida" || !!t.done_at) continue;
    const current = nextActionByImm.get(t.immersion_id);
    const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
    const curDue = current?.due_date ? toLocalDateOnly(current.due_date) : null;
    if (!current) {
      nextActionByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
      continue;
    }
    // Prioriza tarefas com prazo; entre prazos, escolhe o menor.
    if (due && (!curDue || due.getTime() < curDue.getTime())) {
      nextActionByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
    }
    // Se nenhuma das duas tem prazo, mantém a primeira (estável).
  }

  const tasksByImmersion = new Map();
  for (const t of tasks || []) {
    tasksByImmersion.set(t.immersion_id, (tasksByImmersion.get(t.immersion_id) || 0) + 1);
  }

  const upcoming = (immersions || [])
    .slice()
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(0, 10)
    .map((i) => ({
      ...i,
      total_tasks: tasksByImmersion.get(i.id) || 0,
      next_action: nextActionByImm.get(i.id) || null,
    }));

  const { data: overdue, error: errOver } = await supabase
    .from("immersion_tasks")
    .select("id, title, phase, status, due_date, immersion_id, immersions(immersion_name, status)")
    .neq("status", "Concluída")
    .neq("status", "Concluida")
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
      immersion_name: t.immersions?.immersion_name || "-",
      immersion_status: t.immersions?.status || "-",
      days_late: daysBetween(today, t.due_date)
    }));

  // --- Execution signals: risk & workload
  const todayDate = today;
  const dueSoonDays = 3;

  // Map immersions for quick access
  const immById = new Map((immersions || []).map((i) => [i.id, i]));

  // Risk scoring per immersion
  const riskByImm = new Map();
  for (const t of tasks || []) {
    const imm = immById.get(t.immersion_id);
    if (!imm) continue;
    const prev = riskByImm.get(t.immersion_id) || {
      immersion_id: t.immersion_id,
      immersion_name: imm.immersion_name || "-",
      start_date: imm.start_date,
      end_date: imm.end_date,
      status: imm.status,
      overdue: 0,
      dueSoon: 0,
      orphan: 0,
      open: 0
    };

    if (t.status !== "Concluída") {
      prev.open += 1;

      const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
      if (due && todayDate && due.getTime() < todayDate.getTime()) prev.overdue += 1;
      if (due && todayDate) {
        const diff = daysBetween(due, todayDate); // due - today
        if (diff >= 0 && diff <= dueSoonDays) prev.dueSoon += 1;
      }

      if (Object.prototype.hasOwnProperty.call(t, "responsible_id")) {
        if (!t.responsible_id) prev.orphan += 1;
      }
    }

    riskByImm.set(t.immersion_id, prev);
  }

  function calcRisk(row) {
    const startIn = row?.start_date ? daysBetween(toLocalDateOnly(row.start_date), todayDate) : null; // start - today
    const startsSoon = typeof startIn === "number" && startIn >= 0 && startIn <= 7;
    const score = (row.overdue * 5) + (row.dueSoon * 3) + (row.orphan * 2) + (startsSoon && row.open > 0 ? 2 : 0);
    let level = "Baixo";
    if (score >= 15) level = "Alto";
    else if (score >= 7) level = "Médio";
    const reasons = [];
    if (row.overdue) reasons.push(`${row.overdue} atrasada(s)`);
    if (row.dueSoon) reasons.push(`${row.dueSoon} vence(m) em até ${dueSoonDays} dias`);
    if (row.orphan) reasons.push(`${row.orphan} sem responsável`);
    if (startsSoon && row.open) reasons.push(`começa em até 7 dias`);
    return { ...row, score, level, reasons };
  }

  const riskImmersions = Array.from(riskByImm.values())
    .map(calcRisk)
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // Workload by responsible
  let profiles = [];
  try {
    const { data: prof, error: eProf } = await supabase.from("profiles").select("id, name, email, is_active").limit(5000);
    if (eProf) throw eProf;
    profiles = prof ?? [];
  } catch {
    profiles = [];
  }

  const profMap = new Map((profiles || []).map((p) => [p.id, p]));
  const byResp = new Map();
  for (const t of tasks || []) {
    if (!Object.prototype.hasOwnProperty.call(t, "responsible_id")) continue;
    const rid = t.responsible_id || "-";
    const prev = byResp.get(rid) || { responsible_id: rid, responsible: rid === "-" ? "Sem dono" : (profMap.get(rid)?.name || profMap.get(rid)?.email || rid), open: 0, overdue: 0, dueSoon: 0 };
    if (t.status === "Concluída") {
      byResp.set(rid, prev);
      continue;
    }
    prev.open += 1;
    const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
    if (due && todayDate && due.getTime() < todayDate.getTime()) prev.overdue += 1;
    if (due && todayDate) {
      const diff = daysBetween(due, todayDate);
      if (diff >= 0 && diff <= dueSoonDays) prev.dueSoon += 1;
    }
    byResp.set(rid, prev);
  }

  const workload = Array.from(byResp.values())
    .sort((a, b) => (b.open - a.open) || (b.overdue - a.overdue))
    .slice(0, 10);

  return {
    stats: { totalImmersions, totalTasks, doneTasks, lateTasks },
    upcoming,
    overdue: overdueList,
    riskImmersions,
    workload
  };
}
