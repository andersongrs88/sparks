import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

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

function normalizeStatus(v) {
  // Robust normalizer: trim, lowercase and remove accents (works in Node 18+).
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isTaskDone(t) {
  const s = normalizeStatus(t?.status);
  // Accept multiple status conventions (legacy + modern)
  return (
    s === "concluida" ||
    s === "concluido" ||
    s === "finalizada" ||
    s === "finalizado" ||
    s === "done" ||
    s === "completed" ||
    s === "complete" ||
    s === "closed" ||
    !!t?.done_at
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Cache no edge da Vercel (reduz muito a latência do dashboard)
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    // Imersões (limit razoável p/ filtros e listas)
    const { data: immersions, error: errImm } = await supabaseAdmin
      .from("immersions")
      .select("id, immersion_name, start_date, end_date, status")
      .order("start_date", { ascending: false })
      .limit(400);
    if (errImm) throw errImm;

    // Tarefas (colunas mínimas para cálculos)
    const { data: tasks, error: errTasks } = await supabaseAdmin
      .from("immersion_tasks")
      .select("id, immersion_id, title, status, due_date, done_at, phase, responsible_id")
      .limit(20000);
    if (errTasks) throw errTasks;

    const totalImmersions = immersions?.length || 0;
    const totalTasks = tasks?.length || 0;
    const today = toLocalDateOnly(new Date());

    const doneTasks = (tasks || []).filter((t) => isTaskDone(t)).length;
    const lateTasks = (tasks || []).filter((t) => {
      if (!t?.due_date) return false;
      if (isTaskDone(t)) return false;
      const due = toLocalDateOnly(t.due_date);
      return due && today && due.getTime() < today.getTime();
    }).length;

    // Próxima ação por imersão
    const nextActionByImm = new Map();
    for (const t of tasks || []) {
      if (isTaskDone(t)) continue;
      const current = nextActionByImm.get(t.immersion_id);
      const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
      const curDue = current?.due_date ? toLocalDateOnly(current.due_date) : null;
      if (!current) {
        nextActionByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
        continue;
      }
      if (due && (!curDue || due.getTime() < curDue.getTime())) {
        nextActionByImm.set(t.immersion_id, { title: t.title, due_date: t.due_date || null, phase: t.phase || null });
      }
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
        next_action: nextActionByImm.get(i.id) || null
      }));

    // Overdue list (sem segunda query)
    const overdueList = (tasks || [])
      .filter((t) => !isTaskDone(t) && t?.due_date)
      .map((t) => ({
        ...t,
        due_only: toLocalDateOnly(t.due_date)
      }))
      .filter((t) => t.due_only && today && t.due_only.getTime() < today.getTime())
      .sort((a, b) => (a.due_only?.getTime?.() || 0) - (b.due_only?.getTime?.() || 0))
      .slice(0, 80)
      .map((t) => {
        const imm = (immersions || []).find((i) => i.id === t.immersion_id);
        return {
          id: t.id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          due_date: t.due_date,
          immersion_id: t.immersion_id,
          immersion_name: imm?.immersion_name || "-",
          immersion_status: imm?.status || "-",
          days_late: daysBetween(today, t.due_date)
        };
      });

    // --- Signals: risk & workload
    const dueSoonDays = 3;
    const immById = new Map((immersions || []).map((i) => [i.id, i]));

    const riskByImm = new Map();
    for (const t of tasks || []) {
      const imm = immById.get(t.immersion_id);
      if (!imm) continue;
      if (isTaskDone(t)) continue;

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

      prev.open += 1;

      const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
      if (due && today && due.getTime() < today.getTime()) prev.overdue += 1;
      if (due && today) {
        const diff = daysBetween(due, today);
        if (diff >= 0 && diff <= dueSoonDays) prev.dueSoon += 1;
      }

      if (!t.responsible_id) prev.orphan += 1;

      riskByImm.set(t.immersion_id, prev);
    }

    function calcRisk(row) {
      const startIn = row?.start_date ? daysBetween(toLocalDateOnly(row.start_date), today) : null;
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

    // Workload
    const { data: profiles, error: eProf } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, is_active")
      .limit(5000);
    if (eProf) throw eProf;

    const profMap = new Map((profiles || []).map((p) => [p.id, p]));
    const byResp = new Map();

    for (const t of tasks || []) {
      if (isTaskDone(t)) continue;
      const rid = t.responsible_id || "-";
      const prev = byResp.get(rid) || {
        responsible_id: rid,
        responsible: rid === "-" ? "Sem dono" : (profMap.get(rid)?.name || profMap.get(rid)?.email || rid),
        open: 0,
        overdue: 0,
        dueSoon: 0
      };
      prev.open += 1;
      const due = t.due_date ? toLocalDateOnly(t.due_date) : null;
      if (due && today && due.getTime() < today.getTime()) prev.overdue += 1;
      if (due && today) {
        const diff = daysBetween(due, today);
        if (diff >= 0 && diff <= dueSoonDays) prev.dueSoon += 1;
      }
      byResp.set(rid, prev);
    }

    const workload = Array.from(byResp.values())
      .sort((a, b) => (b.overdue - a.overdue) || (b.dueSoon - a.dueSoon) || (b.open - a.open))
      .slice(0, 12);

    return res.status(200).json({
      stats: { totalImmersions, totalTasks, lateTasks, doneTasks },
      upcoming,
      overdue: overdueList,
      riskImmersions,
      workload,
      immersionOptions: (immersions || []).map((i) => ({ id: i.id, immersion_name: i.immersion_name, start_date: i.start_date }))
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Falha ao carregar dashboard." });
  }
}
