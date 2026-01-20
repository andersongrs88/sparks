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

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "consultor_educacao") return "consultor";
  return r;
}

function normalizeStatus(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isTaskDone(t) {
  const s = normalizeStatus(t?.status);
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

// Regra de "atribuição" para o Dashboard:
// - "Atribuída ao usuário" se:
//   (1) responsible_id = userId
//   OU
//   (2) responsible_id é NULL E o usuário é dono (checklist_owner_id) da imersão
function taskIsMine({ task, userId, ownerImmersionIdSet }) {
  if (!userId) return false;
  if (task?.responsible_id && task.responsible_id === userId) return true;
  if (!task?.responsible_id && ownerImmersionIdSet?.has(task?.immersion_id)) return true;
  return false;
}

function taskIsOpen(task) {
  return !isTaskDone(task);
}

function taskIsOverdue(task, today) {
  if (!taskIsOpen(task)) return false;
  if (!task?.due_date) return false;
  const due = toLocalDateOnly(task.due_date);
  return !!(due && today && due.getTime() < today.getTime());
}

function buildImmersionScopeOr({ role, userId }) {
  // Observação: o Dashboard deve respeitar o mesmo escopo da UI.
  // Para Consultor/Designer: apenas imersões atribuídas no campo do papel.
  // checklist_owner_id NÃO deve ampliar o escopo nesses casos (evita contagens/listas divergentes).
  if (!userId) return null;
  switch (normalizeRole(role)) {
    case "consultor":
      return `educational_consultant.eq.${userId}`;
    case "designer":
      return `instructional_designer.eq.${userId}`;
    case "producao":
      return `production_responsible.eq.${userId}`;
    case "eventos":
      return `events_responsible.eq.${userId}`;
    default:
      return `checklist_owner_id.eq.${userId}`;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const userId = typeof req.query?.userId === "string" ? req.query.userId : null;

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    // Perfil/role do usuário (fonte da verdade)
    let role = "viewer";
    if (userId) {
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();
      if (!profErr && prof?.role) role = normalizeRole(prof.role);
    }
    const isAdmin = role === "admin";

    const today = toLocalDateOnly(new Date());
    const dueSoonDays = 3;

    // ---------------------------
    // 1) IMERSÕES — escopo por perfil
    // ---------------------------
    let immersions = [];
    if (isAdmin) {
      const { data, error } = await supabaseAdmin
        .from("immersions")
        .select(
          "id, name, immersion_name, start_date, end_date, status, checklist_owner_id, educational_consultant, instructional_designer, production_responsible, events_responsible"
        )
        .order("start_date", { ascending: false })
        .limit(600);
      if (error) throw error;
      immersions = data || [];
    } else {
      const or = buildImmersionScopeOr({ role, userId });
      const { data, error } = await supabaseAdmin
        .from("immersions")
        .select(
          "id, name, immersion_name, start_date, end_date, status, checklist_owner_id, educational_consultant, instructional_designer, production_responsible, events_responsible"
        )
        .or(or)
        .order("start_date", { ascending: false })
        .limit(600);
      if (error) throw error;
      immersions = data || [];
    }

    const totalImmersions = immersions?.length || 0;

    // Set com imersões onde o usuário é dono (checklist_owner_id)
    const ownerImmersionIdSet = new Set(
      (immersions || [])
        .filter((i) => userId && i?.checklist_owner_id === userId)
        .map((i) => i.id)
        .filter(Boolean)
    );

    // ---------------------------
    // 2) TAREFAS — escopo por perfil
    // ---------------------------
    let tasks = [];

    if (isAdmin) {
      const { data, error } = await supabaseAdmin
        .from("immersion_tasks")
        .select("id, immersion_id, title, status, due_date, done_at, phase, responsible_id")
        .limit(20000);
      if (error) throw error;
      tasks = data || [];
    } else {
      // tasks atribuídas diretamente ao usuário
      const { data: assigned, error: errAssigned } = await supabaseAdmin
        .from("immersion_tasks")
        .select("id, immersion_id, title, status, due_date, done_at, phase, responsible_id")
        .eq("responsible_id", userId)
        .limit(20000);
      if (errAssigned) throw errAssigned;

      // tasks sem responsável, mas dono da imersão = usuário
      let ownedOrphans = [];
      const ownerIds = Array.from(ownerImmersionIdSet.values());
      if (ownerIds.length > 0) {
        const { data: owned, error: errOwned } = await supabaseAdmin
          .from("immersion_tasks")
          .select("id, immersion_id, title, status, due_date, done_at, phase, responsible_id")
          .is("responsible_id", null)
          .in("immersion_id", ownerIds)
          .limit(20000);
        if (errOwned) throw errOwned;
        ownedOrphans = owned || [];
      }

      // união sem duplicação
      const seen = new Set();
      const merged = [];
      for (const t of [...(assigned || []), ...(ownedOrphans || [])]) {
        if (!t?.id) continue;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
      tasks = merged;
    }

    // ---------------------------
    // 3) KPI conforme regras do produto
    // ---------------------------

    // Total de tarefas:
    // - Admin: total geral (todas as tasks)
    // - Consultor/Designer: total de tasks atribuídas ao usuário (responsável OU dono da imersão quando sem responsável)
    const totalTasks = tasks?.length || 0;

    // Concluídas:
    // - Admin: total concluídas geral
    // - Consultor/Designer: total concluídas (no escopo do usuário)
    const doneTasks = (tasks || []).filter(isTaskDone).length;

    // Atrasadas:
    // - Admin: total atrasadas geral (no universo admin)
    // - Consultor/Designer: total das minhas atrasadas (escopo do usuário)
    const overdueTasks = (tasks || []).filter((t) => taskIsOverdue(t, today)).length;
    const lateTasks = overdueTasks;

    // Minhas / Minhas atrasadas:
    // - Sempre: apenas atribuídas ao usuário (responsável OU dono da imersão quando sem responsável)
    let myOpen = 0;
    let myOverdue = 0;

    if (userId) {
      // Para admin, "tasks" é global, então precisamos filtrar o que é dele
      const base = isAdmin ? tasks : tasks; // non-admin já é escopo do usuário
      for (const t of base || []) {
        const mine = isAdmin ? taskIsMine({ task: t, userId, ownerImmersionIdSet }) : true;
        if (!mine) continue;
        if (taskIsOpen(t)) myOpen += 1;
        if (taskIsOverdue(t, today)) myOverdue += 1;
      }
    }

    // ---------------------------
    // 4) Listas do Dashboard (escopo)
    // ---------------------------

    const upcoming = (immersions || [])
      .slice()
      .filter((i) => i?.start_date)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, 8)
      .map((i) => ({
        ...i,
        immersion_name: i?.immersion_name || i?.name || "Imersão",
      }));

    const overdueList = (tasks || [])
      .filter((t) => taskIsOverdue(t, today))
      .sort((a, b) => {
        const da = a?.due_date ? new Date(a.due_date).getTime() : 0;
        const db = b?.due_date ? new Date(b.due_date).getTime() : 0;
        return da - db;
      })
      .slice(0, 80);

    // Risco por imersão (escopo)
    const riskByImm = new Map();
    for (const t of tasks || []) {
      const imm = t?.immersion_id || "-";
      const row = riskByImm.get(imm) || { immersion_id: imm, open: 0, overdue: 0, dueSoon: 0, orphan: 0 };
      if (taskIsOpen(t)) row.open += 1;
      if (taskIsOverdue(t, today)) row.overdue += 1;
      const due = t?.due_date ? toLocalDateOnly(t.due_date) : null;
      if (due && today) {
        const diff = daysBetween(due, today);
        if (diff >= 0 && diff <= dueSoonDays) row.dueSoon += 1;
      }
      // Orphan = sem responsible_id
      if (!t?.responsible_id && taskIsOpen(t)) row.orphan += 1;
      riskByImm.set(imm, row);
    }

    const immById = new Map((immersions || []).map((i) => [i.id, i]));
    function calcRisk(row) {
      const imm = immById.get(row.immersion_id);
      const startIn = imm?.start_date ? daysBetween(toLocalDateOnly(imm.start_date), today) : null;
      const startsSoon = typeof startIn === "number" && startIn >= 0 && startIn <= 7;
      const score = row.overdue * 5 + row.dueSoon * 3 + row.orphan * 2 + (startsSoon && row.open > 0 ? 2 : 0);

      let level = "Baixo";
      if (score >= 15) level = "Alto";
      else if (score >= 7) level = "Médio";

      const reasons = [];
      if (row.overdue) reasons.push(`${row.overdue} atrasada(s)`);
      if (row.dueSoon) reasons.push(`${row.dueSoon} vence(m) em até ${dueSoonDays} dias`);
      if (row.orphan) reasons.push(`${row.orphan} sem responsável`);
      if (startsSoon && row.open) reasons.push("começa em até 7 dias");

      return {
        ...row,
        immersion_name: imm?.immersion_name || imm?.name || "Imersão",
        start_date: imm?.start_date || null,
        score,
        level,
        reasons,
      };
    }

    const riskImmersions = Array.from(riskByImm.values())
      .map(calcRisk)
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    // Workload (carga por responsável) – escopo admin = global, escopo usuário = tasks atribuídas ao usuário (inclui órfãs do owner)
    const { data: profiles, error: eProf } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, is_active")
      .limit(20000);
    if (eProf) throw eProf;

    const profMap = new Map((profiles || []).map((p) => [p.id, p]));
    const byResp = new Map();

    for (const t of tasks || []) {
      const rid = t?.responsible_id || "-";
      const prev =
        byResp.get(rid) || {
          responsible_id: rid === "-" ? null : rid,
          responsible: rid === "-" ? "Sem dono" : profMap.get(rid)?.name || profMap.get(rid)?.email || rid,
          open: 0,
          overdue: 0,
          dueSoon: 0,
        };

      if (taskIsOpen(t)) prev.open += 1;
      if (taskIsOverdue(t, today)) prev.overdue += 1;

      const due = t?.due_date ? toLocalDateOnly(t.due_date) : null;
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
      stats: {
        totalImmersions,
        totalTasks,
        overdueTasks,
        lateTasks,
        doneTasks,
        myOpen,
        myOverdue,
      },
      upcoming,
      overdue: overdueList,
      riskImmersions,
      workload,
      immersionOptions: (immersions || []).map((i) => ({
        id: i.id,
        immersion_name: i?.immersion_name || i?.name || "Imersão",
        start_date: i.start_date,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Falha ao carregar dashboard." });
  }
}
