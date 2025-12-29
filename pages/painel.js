import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import BottomSheet from "../components/BottomSheet";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { bulkUpdateTasks, isTaskDone, syncOverdueTasksGlobal } from "../lib/tasks";

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function toDateOnly(isoStr) {
  if (!isoStr) return null;
  return new Date(isoStr + "T00:00:00");
}

function daysBetween(aISO, bISO) {
  const a = toDateOnly(aISO);
  const b = toDateOnly(bISO);
  if (!a || !b) return null;
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (24 * 3600 * 1000));
}

function slaForTask(task) {
  const today = iso(new Date());
  if (!task?.due_date || isTaskDone(task)) return { label: "Sem SLA", className: "badge muted" };

  if (task.due_date < today) {
    const late = Math.abs(daysBetween(task.due_date, today) || 0);
    return { label: `Atrasada ${late}d`, className: "badge danger" };
  }
  if (task.due_date === today) return { label: "Vence hoje", className: "badge" };
  const inDays = daysBetween(today, task.due_date);
  if (typeof inDays === "number" && inDays >= 0 && inDays <= 7) return { label: `Em ${inDays}d`, className: "badge" };
  return { label: "No prazo", className: "badge muted" };
}


async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

function buildTaskLink(task) {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  return `${origin}/painel?immersionId=${encodeURIComponent(task.immersion_id)}&taskId=${encodeURIComponent(task.id)}`;
}

const PHASES = [
  { value: "PA-PRE", label: "PA-PRÉ" },
  { value: "DURANTE", label: "DURANTE" },
  { value: "POS", label: "PÓS" },
];

const STATUS_OPTIONS = [
  { value: "Programada", label: "Programada" },
  { value: "Em andamento", label: "Em andamento" },
  { value: "Bloqueada", label: "Bloqueada" },
  { value: "Concluída", label: "Concluída" },
];

export default function PainelPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  // Toast (feedback leve, sem `alert`)
  const [toast, setToast] = useState({ open: false, message: "", tone: "", actionLabel: "" });
  const toastActionRef = useRef(null);
  const toastTimerRef = useRef(null);

  function notify(message, tone = "", action) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    const actionLabel = action?.label ? String(action.label) : "";
    toastActionRef.current = typeof action?.onClick === "function" ? action.onClick : null;

    setToast({
      open: true,
      message: String(message || ""),
      tone: String(tone || ""),
      actionLabel
    });

    toastTimerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, open: false, actionLabel: "" }));
      toastActionRef.current = null;
    }, actionLabel ? 5200 : 2200);
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [query, setQuery] = useState("");
  const [immersionId, setImmersionId] = useState("all");
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("Pendentes");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  // Drawer (BottomSheet) da tarefa
  const [taskOpen, setTaskOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [taskSaving, setTaskSaving] = useState(false);

  const [editPhase, setEditPhase] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editDoneAt, setEditDoneAt] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [immersionOptions, setImmersionOptions] = useState([]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const overdueSyncDone = useRef(false);
  const selectedCount = selectedIds.size;

  const [showFilters, setShowFilters] = useState(false);

  // UI: Colapso/expansão por bloco (triagem rápida, especialmente no mobile)
  // Ordem desejada: Atrasadas, Próximos 7 dias, Inbox e Todas.
  // Mantemos "Vencem hoje" por utilidade operacional.
  const SECTION_ORDER = ["overdue", "next7", "inbox", "all", "dueToday"];
  const [collapsedByKey, setCollapsedByKey] = useState(() => ({
    overdue: false,
    next7: false,
    inbox: false,
    all: false,
    dueToday: false,
  }));

  const sectionRefs = useRef({});

  // Bulk state
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [bulkPhase, setBulkPhase] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // URL -> filtros (suporta /painel?immersionId=...&view=inbox)
  useEffect(() => {
    if (!router.isReady) return;
    const qImm = router.query?.immersionId;
    if (typeof qImm === "string" && qImm.trim()) setImmersionId(qImm);
    if (router.query?.view === "inbox") {
      setStatus("Pendentes");
      setOnlyOverdue(false);
    }
    // não removemos query params aqui: são parte do link compartilhável
  }, [router.isReady, router.query?.immersionId, router.query?.view]);

  useEffect(() => {
    if (authLoading || !user) return;

    let mounted = true;

    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("immersions")
          .select("id, immersion_name, start_date")
          .order("start_date", { ascending: false })
          .limit(400);
        if (e) throw e;
        if (!mounted) return;
        setImmersionOptions((data || []).map((r) => ({ id: r.id, name: r.immersion_name, start_date: r.start_date })));
      } catch {
        // ignore
      }
    })();

    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("profiles")
          .select("id, name, email, is_active")
          .order("is_active", { ascending: false })
          .order("name", { ascending: true })
          .limit(2000);
        if (e) throw e;
        if (!mounted) return;
        setProfiles(data || []);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  async function loadTasks() {
    try {
      setError("");
      setLoading(true);

      // Governança: manter atrasadas sinalizadas (best-effort)
      // Evita rodar em toda mudança de filtro para não degradar performance.
      if (!overdueSyncDone.current) {
        try {
          await syncOverdueTasksGlobal();
        } catch {}
        overdueSyncDone.current = true;
      }

      // Select compatível com bases antigas
      const base = "id, immersion_id, template_item_id, title, phase, status, due_date, done_at, notes, responsible_id, created_at, updated_at, immersions(immersion_name)";
      let q = supabase
        .from("immersion_tasks")
        .select(base)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1200);

      if (immersionId !== "all") q = q.eq("immersion_id", immersionId);
      if (phase !== "all") q = q.eq("phase", phase);

      if (status === "Concluídas") {
        q = q.or("status.ilike.%conclu%,done_at.not.is.null");
      } else {
        q = q.or("status.is.null,status.not.ilike.%conclu%,done_at.is.null");
      }

      if (query?.trim()) {
        const term = query.trim();
        // busca por título + nome da imersão (join)
        q = q.or(`title.ilike.%${term}%,immersions.immersion_name.ilike.%${term}%`);
      }

      const { data, error: e } = await q;
      if (e) throw e;

      let rows = (data || []).map((t) => ({
        ...t,
        immersion_name: t?.immersions?.immersion_name || "—",
      }));

      if (onlyOverdue) {
        const today = iso(new Date());
        rows = rows.filter((t) => t.due_date && !isTaskDone(t) && t.due_date < today);
      }

      setTasks(rows);

      // seleção: remove ids que não existem mais no filtro
      setSelectedIds((prev) => {
        if (!prev.size) return prev;
        const ids = new Set(rows.map((r) => r.id));
        const next = new Set();
        for (const id of prev) if (ids.has(id)) next.add(id);
        return next;
      });
    } catch (e) {
      setError(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, query, immersionId, phase, status, onlyOverdue]);

  const profileLabelById = useMemo(() => {
    const map = new Map();
    for (const p of profiles || []) {
      map.set(p.id, (p.name || p.email || p.id));
    }
    return map;
  }, [profiles]);

  const grouped = useMemo(() => {
    const today = iso(new Date());
    const add7 = new Date(today + "T00:00:00");
    add7.setDate(add7.getDate() + 7);
    const plus7 = iso(add7);

    const pending = (tasks || []).filter((t) => !isTaskDone(t));

    const inbox = pending.filter((t) => !t.responsible_id || !t.due_date || !t.phase);
    const overdue = pending.filter((t) => t.due_date && t.due_date < today);
    const dueToday = pending.filter((t) => t.due_date === today);
    const next7 = pending.filter((t) => t.due_date && t.due_date > today && t.due_date <= plus7);

    return { inbox, overdue, dueToday, next7, all: tasks || [] };
  }, [tasks]);

  function openTask(task) {
    if (!task?.id) return;
    setActiveTask(task);
    setEditPhase(task.phase || "");
    setEditOwner(task.responsible_id || "");
    setEditDue(task.due_date || "");
    setEditStatus(task.status || (isTaskDone(task) ? "Concluída" : "Programada"));
    setEditNotes(task.notes || "");
    setTaskOpen(true);
  }

  function closeTask() {
    setTaskOpen(false);
  }

  async function fetchTaskById(taskId) {
    const base =
      "id, immersion_id, template_item_id, title, phase, status, due_date, done_at, notes, responsible_id, created_at, updated_at, immersions(immersion_name)";
    const { data, error: e } = await supabase.from("immersion_tasks").select(base).eq("id", taskId).maybeSingle();
    if (e) throw e;
    if (!data) return null;
    return { ...data, immersion_name: data?.immersions?.immersion_name || "—" };
  }

  async function saveActiveTask() {
    if (!activeTask?.id) return;

    // Snapshot para "Desfazer" (drawer edits)
    const prev = {
      id: activeTask.id,
      phase: activeTask.phase ?? null,
      responsible_id: activeTask.responsible_id ?? null,
      due_date: activeTask.due_date ?? null,
      status: activeTask.status ?? null,
      done_at: activeTask.done_at ?? null,
      notes: activeTask.notes ?? null,
    };

    try {
      setTaskSaving(true);

      const patch = {
        phase: editPhase || null,
        responsible_id: editOwner || null,
        due_date: editDue || null,
        status: editStatus || null,
        done_at: editDoneAt || null,
        notes: editNotes || null,
      };

      // Regra: status concluída => done_at preenchido; caso contrário, null
      const concluded = String(editStatus || "").toLowerCase().includes("conclu");
      patch.done_at = concluded ? (activeTask.done_at || new Date().toISOString()) : null;

      const { error: e } = await supabase.from("immersion_tasks").update(patch).eq("id", activeTask.id);
      if (e) throw e;

      // UI local (sem esperar reload)
      setActiveTask((t) => (t ? { ...t, ...patch } : t));
      setTasks((prevTasks) => (prevTasks || []).map((t) => (t.id === prev.id ? { ...t, ...patch } : t)));

      notify("Tarefa atualizada.", "success", {
        label: "Desfazer",
        onClick: async () => {
          try {
            const { error: err } = await supabase
              .from("immersion_tasks")
              .update({
                phase: prev.phase,
                responsible_id: prev.responsible_id,
                due_date: prev.due_date,
                status: prev.status,
                done_at: prev.done_at,
                notes: prev.notes,
                updated_at: new Date().toISOString(),
              })
              .eq("id", prev.id);
            if (err) throw err;

            // Reverte UI
            setActiveTask((t) => (t ? { ...t, ...prev } : t));
            setTasks((prevTasks) => (prevTasks || []).map((t) => (t.id === prev.id ? { ...t, ...prev } : t)));

            notify("Alteração desfeita.", "success");
          } catch (e2) {
            notify(e2?.message || "Falha ao desfazer.", "danger");
          } finally {
            await loadTasks();
          }
        },
      });

      // Revalida (garante consistência com filtros)
      await loadTasks();
    } catch (e) {
      notify(e?.message || "Falha ao salvar.", "danger");
    } finally {
      setTaskSaving(false);
    }
  }

  async function toggleConcludeActive() {
    if (!activeTask) return;

    // Snapshot para "Desfazer"
    const prev = {
      id: activeTask.id,
      status: activeTask.status || null,
      done_at: activeTask.done_at || null
    };

    const done = isTaskDone(activeTask);
    const nextStatus = done ? "Programada" : "Concluída";
    const nextDoneAt = done ? null : new Date().toISOString();

    setEditStatus(nextStatus);
    setEditDoneAt(nextDoneAt);

    // Salva imediatamente para reduzir cliques no mobile
    setTimeout(async () => {
      await saveActiveTask();

      // UI otimista (drawer + lista)
      setActiveTask((t) => (t ? { ...t, status: nextStatus, done_at: nextDoneAt } : t));
      setTasks((prevTasks) =>
        (prevTasks || []).map((t) => (t.id === prev.id ? { ...t, status: nextStatus, done_at: nextDoneAt } : t))
      );

      notify(done ? "Tarefa reaberta." : "Tarefa concluída.", "success", {
        label: "Desfazer",
        onClick: async () => {
          try {
            // Reverte no banco
            const { error } = await supabase
              .from("immersion_tasks")
              .update({ status: prev.status, done_at: prev.done_at, updated_at: new Date().toISOString() })
              .eq("id", prev.id);
            if (error) throw error;

            // Reverte UI
            setActiveTask((t) => (t ? { ...t, status: prev.status, done_at: prev.done_at } : t));
            setTasks((prevTasks) =>
              (prevTasks || []).map((t) => (t.id === prev.id ? { ...t, status: prev.status, done_at: prev.done_at } : t))
            );

            notify("Alteração desfeita.", "success");
          } catch (e) {
            notify(e?.message || "Falha ao desfazer.", "danger");
          }
        }
      });
    }, 0);
  }

  // Deep-link: /painel?immersionId=...&taskId=... (abre a tarefa automaticamente)
  useEffect(() => {
    if (!router.isReady) return;
    const taskId = router.query?.taskId;
    if (typeof taskId !== "string" || !taskId) return;
    if (loading) return;

    let cancelled = false;
    (async () => {
      const found = (tasks || []).find((t) => t.id === taskId);
      if (cancelled) return;
      if (found) {
        openTask(found);
      } else {
        // fallback: pode não estar no filtro atual
        try {
          const single = await fetchTaskById(taskId);
          if (cancelled) return;
          if (single) openTask(single);
        } catch {
          // ignore
        }
      }

      // remove taskId da URL para evitar reabrir em refresh
      try {
        const nextQuery = { ...(router.query || {}) };
        delete nextQuery.taskId;
        router.replace({ pathname: "/painel", query: nextQuery }, undefined, { shallow: true });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query?.taskId, loading, tasks]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkMsg("");
  }

  function selectAllToggle() {
    // Seleciona todas as tarefas do filtro atual (carregadas na tela)
    const ids = (tasks || []).map((t) => t?.id).filter(Boolean);
    if (!ids.length) return;
    setSelectedIds((prev) => {
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  }

  function collapseAllSections() {
    setCollapsedByKey((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => (next[k] = true));
      return next;
    });
  }

  function scrollToSection(key) {
    // Expande o bloco e faz scroll suave para o topo dele
    setCollapsedByKey((prev) => ({ ...prev, [key]: false }));
    const el = sectionRefs.current?.[key];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        el.scrollIntoView();
      }
    }
  }

  async function applyBulk(patch) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    // Snapshot para desfazer (somente campos que vamos alterar)
    const keys = Object.keys(patch || {});
    const prevById = new Map();
    (tasks || []).forEach((t) => {
      if (t?.id && ids.includes(t.id)) {
        const snap = { id: t.id };
        keys.forEach((k) => (snap[k] = t[k] ?? null));
        prevById.set(t.id, snap);
      }
    });

    // UI otimista
    setTasks((prev) =>
      (prev || []).map((t) => {
        if (!t?.id || !ids.includes(t.id)) return t;
        const next = { ...t };
        keys.forEach((k) => {
          next[k] = patch[k];
        });
        return next;
      })
    );

    try {
      setBulkBusy(true);
      setBulkMsg("Aplicando...");

      await bulkUpdateTasks(ids, patch);

      setBulkMsg("Alterações aplicadas.");
      notify("Alterações aplicadas.", "success", {
        label: "Desfazer",
        onClick: async () => {
          try {
            setBulkBusy(true);
            setBulkMsg("Desfazendo...");

            // Reverte por tarefa (patch específico)
            for (const id of ids) {
              const snap = prevById.get(id);
              if (!snap) continue;
              const restore = {};
              keys.forEach((k) => (restore[k] = snap[k] ?? null));
              await updateTask(id, restore);
            }

            // Reverte UI
            setTasks((prev) =>
              (prev || []).map((t) => {
                if (!t?.id || !ids.includes(t.id)) return t;
                const snap = prevById.get(t.id);
                if (!snap) return t;
                const next = { ...t };
                keys.forEach((k) => (next[k] = snap[k] ?? null));
                return next;
              })
            );

            notify("Alterações desfeitas.", "success");
          } catch (e) {
            notify(e?.message || "Falha ao desfazer.", "danger");
          } finally {
            setBulkBusy(false);
            setBulkMsg("");
            await loadTasks();
          }
        }
      });

      // Revalida para garantir consistência
      await loadTasks();
      setTimeout(() => setBulkMsg(""), 2200);
    } catch (e) {
      // Em caso de erro, desfaz UI otimista com reload
      setBulkMsg(e?.message || "Falha ao aplicar alterações.");
      await loadTasks();
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkConclude() {
    await applyBulk({ status: "Concluída", done_at: new Date().toISOString() });
    clearSelection();
  }

  async function handleBulkReassign() {
    // bulkOwner: "" = não aplica, "__none__" = remover
    if (!bulkOwner) return;
    const patch = bulkOwner === "__none__" ? { responsible_id: null } : { responsible_id: bulkOwner };
    await applyBulk(patch);
    setBulkOwner("");
  }

  async function handleBulkReschedule() {
    if (!bulkDue) return;
    await applyBulk({ due_date: bulkDue });
    setBulkDue("");
  }

  async function handleBulkPhase() {
    if (!bulkPhase) return;
    await applyBulk({ phase: bulkPhase });
    setBulkPhase("");
  }

  function FiltersContent() {
    return (
      <div className="grid" style={{ gap: 12 }}>
        <div className="grid" style={{ gap: 6 }}>
          <label className="label">Buscar</label>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tarefa ou imersão" />
        </div>

        <div className="grid" style={{ gap: 6 }}>
          <label className="label">Imersão</label>
          <select className="input" value={immersionId} onChange={(e) => setImmersionId(e.target.value)}>
            <option value="all">Todas</option>
            {(immersionOptions || []).map((im) => (
              <option key={im.id} value={im.id}>
                {im.name}
              </option>
            ))}
          </select>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="grid" style={{ gap: 6, flex: 1 }}>
            <label className="label">Fase</label>
            <select className="input" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="all">Todas</option>
              {PHASES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid" style={{ gap: 6, flex: 1 }}>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Pendentes">Pendentes</option>
              <option value="Concluídas">Concluídas</option>
            </select>
          </div>
        </div>

        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          <span className="small">Somente atrasadas (atalho)</span>
        </label>

        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => {
            setQuery("");
            setImmersionId("all");
            setPhase("all");
            setStatus("Pendentes");
            setOnlyOverdue(false);
          }}>
            Limpar
          </button>
          <button className="btn primary" type="button" onClick={() => setShowFilters(false)}>
            Aplicar
          </button>
        </div>
      </div>
    );
  }

  function TaskRow({ t }) {
    const sla = slaForTask(t);
    const dueLabel = t.due_date ? `Prazo: ${t.due_date}` : "Sem prazo";
    const ownerLabel = t.responsible_id ? (profileLabelById.get(t.responsible_id) || t.responsible_id) : "Sem responsável";
    const phaseLabel = t.phase ? `Fase: ${t.phase}` : "Sem fase";
    const immLabel = t.immersion_name ? `Imersão: ${t.immersion_name}` : "Imersão";
    return (
      <div className="planTask" role="listitem">
        <div className="planTaskSelect">
          <input
            aria-label="Selecionar tarefa"
            type="checkbox"
            checked={selectedIds.has(t.id)}
            onChange={() => toggleSelected(t.id)}
          />
        </div>

        <button
          type="button"
          className="planTaskMain"
          onClick={() => openTask(t)}
          aria-label={`Abrir tarefa: ${t.title}`}
        >
          <div className="planTaskTitle">{t.title}</div>
          <div className="planTaskMeta" aria-label="Detalhes da tarefa">
            <span className="pill soft">{immLabel}</span>
            <span className="pill soft">{phaseLabel}</span>
            <span className="pill soft">{ownerLabel}</span>
            <span className={t.due_date ? "pill due" : "pill soft"}>{dueLabel}</span>
          </div>
        </button>

        <div className="planTaskAside">
          <span className={sla.className}>{sla.label}</span>
          {isTaskDone(t) ? <span className="badge success">Concluída</span> : null}
          <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                const rt = encodeURIComponent(router.asPath);
                router.push(`/imersoes/${t.immersion_id}?returnTo=${rt}`);
              }}
            >
              Imersão
            </button>
            <button
              type="button"
              className="btn small"
              onClick={async (e) => {
                e.stopPropagation();
                const ok = await copyText(buildTaskLink(t));
                if (!ok) notify("Não foi possível copiar o link.", "danger");
                else notify("Link copiado.", "success");
              }}
            >
              Copiar link
            </button>
          </div>
        </div>
      </div>
    );
  }

  function Block({ keyName, title, hint, items }) {
    const isCollapsed = !!collapsedByKey?.[keyName];
    return (
      <div
        className="card"
        style={{ marginTop: 12 }}
        ref={(el) => {
          if (el && keyName) sectionRefs.current[keyName] = el;
        }}
      >
        <div className="sectionHeader" style={{ alignItems: "center" }}>
          <div>
            <h3 className="sectionTitle">{title}</h3>
            {hint ? <div className="small muted">{hint}</div> : null}
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="pill" aria-label={`Quantidade: ${items.length}`}>{items.length}</span>
            <button
              type="button"
              className="btn small"
              onClick={() => setCollapsedByKey((prev) => ({ ...prev, [keyName]: !prev[keyName] }))}
              aria-expanded={!isCollapsed}
              aria-controls={`section-${keyName}`}
            >
              {isCollapsed ? "Expandir" : "Recolher"}
            </button>
          </div>
        </div>

        <div id={`section-${keyName}`} hidden={isCollapsed}>
          {items.length === 0 ? (
            <div className="emptyState" style={{ marginTop: 10 }}>
              <div className="small muted">Sem itens neste bloco.</div>
            </div>
          ) : (
            <div className="list" style={{ marginTop: 10 }}>
              {items.map((t) => (
                <TaskRow key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const bulkBar = selectedCount > 0 ? (
    <div className="bulkBar" role="region" aria-label="Ações em lote">
      <div className="bulkBarInner">
        <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
          <span className="badge">{selectedCount}</span>
          <button className="btn" type="button" onClick={clearSelection} disabled={bulkBusy}>
            Limpar seleção
          </button>
        </div>

        <div className="row wrap" style={{ gap: 10, justifyContent: "flex-end" }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small muted">Reatribuir</span>
            <select className="input" value={bulkOwner} onChange={(e) => setBulkOwner(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">Selecionar</option>
              <option value="__none__">Remover responsável</option>
              {(profiles || []).map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.email || p.id}</option>
              ))}
            </select>
            <button className="btn" type="button" onClick={handleBulkReassign} disabled={bulkBusy || !bulkOwner}>
              Aplicar
            </button>
          </div>

          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small muted">Reagendar</span>
            <input className="input" type="date" value={bulkDue} onChange={(e) => setBulkDue(e.target.value)} />
            <button className="btn" type="button" onClick={handleBulkReschedule} disabled={bulkBusy || !bulkDue}>
              Aplicar
            </button>
          </div>

          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small muted">Mudar fase</span>
            <select className="input" value={bulkPhase} onChange={(e) => setBulkPhase(e.target.value)}>
              <option value="">Selecionar</option>
              {PHASES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button className="btn" type="button" onClick={handleBulkPhase} disabled={bulkBusy || !bulkPhase}>
              Aplicar
            </button>
          </div>

          <button className="btn primary" type="button" onClick={handleBulkConclude} disabled={bulkBusy}>
            Concluir
          </button>
        </div>

        {bulkBusy ? <div className="small muted" style={{ marginTop: 8 }}>Aplicando alterações…</div> : null}
        {bulkMsg ? <div className="small muted" style={{ marginTop: 6 }}>{bulkMsg}</div> : null}
      </div>
    </div>
  ) : null;

  if (authLoading) return null;
  if (!user) return null;

  const allSelected = (tasks || []).length > 0 && selectedCount === (tasks || []).length;

  return (
    <Layout title="Plano de Ação">
      <div className="container">
        <div className="sectionHeader">
          <div>
            <h2 style={{ margin: 0 }}>Plano de Ação</h2>
            <div className="small muted">Triagem e execução por prioridade (web e mobile)</div>
          </div>

          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn onlyDesktop" type="button" onClick={() => setShowFilters(true)}>
              Filtros
            </button>
            <button className="btn onlyMobile" type="button" onClick={() => setShowFilters(true)}>
              Filtros
            </button>
            <button
              className="btn"
              type="button"
              onClick={selectAllToggle}
              disabled={loading || !(tasks || []).length}
              aria-label={allSelected ? "Limpar seleção de todas as tarefas" : "Selecionar todas as tarefas"}
            >
              {allSelected ? "Limpar tudo" : "Selecionar tudo"}
            </button>
            <button className="btn" type="button" onClick={collapseAllSections} disabled={loading}>
              Recolher todas
            </button>
            <button className="btn" type="button" onClick={loadTasks}>
              Atualizar
            </button>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 10 }} aria-label="Filtros rápidos">
          <button className="btn small" type="button" onClick={() => scrollToSection("overdue")} disabled={loading}>
            Atrasadas
          </button>
          <button className="btn small" type="button" onClick={() => scrollToSection("next7")} disabled={loading}>
            Próximos 7 dias
          </button>
          <button className="btn small" type="button" onClick={() => scrollToSection("inbox")} disabled={loading}>
            Inbox
          </button>
          <button className="btn small" type="button" onClick={() => scrollToSection("all")} disabled={loading}>
            Todas
          </button>
        </div>

        {error ? (
          <div className="alert danger" role="status">{error}</div>
        ) : null}

        {loading ? <div className="skeletonList" aria-label="Carregando" /> : null}

        {!loading ? (
          <>
            <Block
              keyName="overdue"
              title="Atrasadas"
              hint="Prioridade máxima. Resolva ou reagende."
              items={grouped.overdue}
            />
            <Block
              keyName="dueToday"
              title="Vencem hoje"
              hint="Fechamento do dia."
              items={grouped.dueToday}
            />
            <Block
              keyName="next7"
              title="Próximos 7 dias"
              hint="Planejamento imediato."
              items={grouped.next7}
            />
            <Block
              keyName="inbox"
              title="Inbox"
              hint="Tarefas sem responsável, sem prazo ou sem fase. Use as ações em lote para triagem rápida."
              items={grouped.inbox}
            />
            <Block
              keyName="all"
              title="Todas"
              hint="Visão completa conforme filtros."
              items={grouped.all}
            />
          </>
        ) : null}

        {bulkBar}

        <BottomSheet
          open={showFilters}
          onClose={() => setShowFilters(false)}
          title="Filtros"
          footer={
            <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
              <button className="btn" type="button" onClick={() => setShowFilters(false)}>
                Fechar
              </button>
            </div>
          }
        >
          <FiltersContent />
        </BottomSheet>

        <BottomSheet
          open={taskOpen}
          onClose={closeTask}
          title={activeTask ? "Tarefa" : "Tarefa"}
          footer={
            <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <button className="btn" type="button" onClick={toggleConcludeActive} disabled={!activeTask || taskSaving}>
                  {activeTask && !isTaskDone(activeTask) ? "Concluir" : "Reabrir"}
                </button>
                {activeTask ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      const ok = await copyText(buildTaskLink(activeTask));
                      if (!ok) notify("Não foi possível copiar o link.", "danger");
                      else notify("Link copiado.", "success");
                    }}
                    disabled={taskSaving}
                  >
                    Copiar link
                  </button>
                ) : null}
              </div>

              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <button className="btn" type="button" onClick={closeTask} disabled={taskSaving}>
                  Fechar
                </button>
                <button className="btn primary" type="button" onClick={saveActiveTask} disabled={!activeTask || taskSaving}>
                  {taskSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          }
        >
          {!activeTask ? (
            <div className="small muted">Nenhuma tarefa selecionada.</div>
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              <div>
                <div className="small muted">Título</div>
                <div style={{ fontWeight: 600 }}>{activeTask.title}</div>
              </div>

              <div className="row wrap" style={{ gap: 10 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const rt = encodeURIComponent(router.asPath);
                    router.push(`/imersoes/${activeTask.immersion_id}?returnTo=${rt}`);
                  }}
                  disabled={taskSaving}
                >
                  Abrir imersão
                </button>
                {activeTask.template_item_id ? <span className="pill soft">Origem: template</span> : <span className="pill soft">Origem: manual</span>}
                <span className="pill soft">{activeTask.immersion_name || "—"}</span>
              </div>

              <div className="row wrap" style={{ gap: 12 }}>
                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Fase</label>
                  <select className="input" value={editPhase} onChange={(e) => setEditPhase(e.target.value)} disabled={taskSaving}>
                    <option value="">Sem fase</option>
                    {PHASES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Responsável</label>
                  <select className="input" value={editOwner} onChange={(e) => setEditOwner(e.target.value)} disabled={taskSaving}>
                    <option value="">Sem responsável</option>
                    {(profiles || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.email || p.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row wrap" style={{ gap: 12 }}>
                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Prazo</label>
                  <input className="input" type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} disabled={taskSaving} />
                </div>

                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Status</label>
                  <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={taskSaving}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid" style={{ gap: 6 }}>
                <label className="label">Notas</label>
                <textarea className="input" rows={4} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} disabled={taskSaving} />
              </div>
            </div>
          )}
        </BottomSheet>

        <div className="toastHost" aria-live="polite" aria-atomic="true">
          {toast.open ? (
            <div className={`toast ${toast.tone || ""}`.trim()} role="status" aria-live="polite">
              <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span>{toast.message}</span>
                {toast.actionLabel ? (
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      const fn = toastActionRef.current;
                      setToast((t) => ({ ...t, open: false, actionLabel: "" }));
                      toastActionRef.current = null;
                      if (typeof fn === "function") fn();
                    }}
                  >
                    {toast.actionLabel}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
