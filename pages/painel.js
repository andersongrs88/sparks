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

const PHASES = [
  { value: "PA-PRE", label: "PA-PRÉ" },
  { value: "DURANTE", label: "DURANTE" },
  { value: "POS", label: "PÓS" },
];

export default function PainelPage() {
  const router = useRouter();

  const RETURN_KEY = "sparks:painel:return";
  const [copyMsg, setCopyMsg] = useState("");

  function saveReturnState() {
    try {
      if (typeof window === "undefined") return;
      const payload = { url: router.asPath, y: window.scrollY || 0, ts: Date.now() };
      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify(payload));
    } catch {}
  }

  function restoreReturnState() {
    try {
      if (typeof window === "undefined") return;
      const raw = window.sessionStorage.getItem(RETURN_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Expira em 10 minutos para evitar comportamento inesperado
      if (!data?.url || Date.now() - (data.ts || 0) > 10 * 60 * 1000) {
        window.sessionStorage.removeItem(RETURN_KEY);
        return;
      }
      // Compara com a URL atual (sem exigir taskId)
      const current = router.asPath || "";
      const stripTaskId = (u) => u.replace(/([?&])taskId=[^&]+(&?)/, (m, p1, p2) => (p2 ? p1 : ""));
      if (stripTaskId(data.url) !== stripTaskId(current)) return;

      window.sessionStorage.removeItem(RETURN_KEY);
      const y = Number(data.y || 0);
      if (!Number.isNaN(y)) window.scrollTo({ top: y, behavior: "auto" });
    } catch {}
  }

  function buildTaskLink(task) {
    if (!task?.id || !task?.immersion_id) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/painel?immersionId=${task.immersion_id}&taskId=${task.id}`;
  }

  async function copyTaskLink(task) {
    try {
      const link = buildTaskLink(task);
      if (!link) return;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyMsg("Link copiado.");
      window.setTimeout(() => setCopyMsg(""), 1800);
    } catch {
      setCopyMsg("Não foi possível copiar.");
      window.setTimeout(() => setCopyMsg(""), 1800);
    }
  }

  // Deep-link: /painel?immersionId=...&taskId=...
  const [initialTaskId, setInitialTaskId] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query || {};
    if (q.immersionId && typeof q.immersionId === "string") setImmersionId(q.immersionId);
    if (q.phase && typeof q.phase === "string") setPhase(q.phase);
    if (q.status && typeof q.status === "string") setStatus(q.status);
    if (q.ownerId && typeof q.ownerId === "string") setOwnerId(q.ownerId);
    if (q.view === "inbox") setTriage("inbox");
    if (q.triage && typeof q.triage === "string") setTriage(q.triage);
    if (q.overdue === "1") setOnlyOverdue(true);
    if (q.taskId && typeof q.taskId === "string") setInitialTaskId(q.taskId);
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    restoreReturnState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [query, setQuery] = useState("");
  const [immersionId, setImmersionId] = useState("all");
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("Pendentes");
  const [ownerId, setOwnerId] = useState("all");
  const [triage, setTriage] = useState("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const [immersionOptions, setImmersionOptions] = useState([]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const overdueSyncDone = useRef(false);
  const selectedCount = selectedIds.size;

  const [showFilters, setShowFilters] = useState(false);

  // Task drawer (BottomSheet)
  const [activeTask, setActiveTask] = useState(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskPatch, setTaskPatch] = useState({ phase: "", responsible_id: "", due_date: "", status: "", notes: "" });
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskMsg, setTaskMsg] = useState("");

  // Bulk state
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [bulkPhase, setBulkPhase] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

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

  async function loadTasks(overrides = {}) {
    try {
      setError("");
      setLoading(true);

      const eff = {
        query: overrides.query ?? query,
        immersionId: overrides.immersionId ?? immersionId,
        phase: overrides.phase ?? phase,
        status: overrides.status ?? status,
        ownerId: overrides.ownerId ?? ownerId,
        triage: overrides.triage ?? triage,
        onlyOverdue: overrides.onlyOverdue ?? onlyOverdue,
      };

      // Governança: manter atrasadas sinalizadas (best-effort)
      // Evita rodar em toda mudança de filtro para não degradar performance.
      if (!overdueSyncDone.current) {
        try {
          await syncOverdueTasksGlobal();
        } catch {}
        overdueSyncDone.current = true;
      }

      // Select compatível com bases antigas
      const base = "id, immersion_id, template_item_id, title, phase, area, status, due_date, done_at, notes, responsible_id, created_at, updated_at, immersions(immersion_name)";
      let q = supabase
        .from("immersion_tasks")
        .select(base)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1200);

      if (eff.immersionId !== "all") q = q.eq("immersion_id", eff.immersionId);
      if (eff.phase !== "all") q = q.eq("phase", eff.phase);
      if (eff.ownerId !== "all") q = q.eq("responsible_id", eff.ownerId);
      if (eff.triage === "unassigned") q = q.is("responsible_id", null);
      if (eff.triage === "nodue") q = q.is("due_date", null);
      if (eff.triage === "nophase") q = q.is("phase", null);

      if (eff.status === "Concluídas") {
        q = q.or("status.ilike.%conclu%,done_at.not.is.null");
      } else {
        q = q.or("status.is.null,status.not.ilike.%conclu%,done_at.is.null");
      }

      if (eff.query?.trim()) {
        const term = eff.query.trim();
        // busca por título + nome da imersão (join)
        q = q.or(`title.ilike.%${term}%,immersions.immersion_name.ilike.%${term}%`);
      }

      const { data, error: e } = await q;
      if (e) throw e;

      let rows = (data || []).map((t) => ({
        ...t,
        immersion_name: t?.immersions?.immersion_name || "—",
      }));

      if (eff.onlyOverdue) {
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

  function openTaskSheet(t) {
    setActiveTask(t);
    setTaskPatch({
      phase: t?.phase || "",
      responsible_id: t?.responsible_id || "",
      due_date: t?.due_date || "",
      status: t?.status || "",
      notes: t?.notes || "",
    });
    setTaskSheetOpen(true);
  }

  // Abre automaticamente uma tarefa quando a URL contém taskId
  // Ex.: /painel?immersionId=<uuid>&taskId=<uuid>
  useEffect(() => {
    if (!initialTaskId) return;
    if (loading) return;
    const t = (tasks || []).find((x) => x.id === initialTaskId);
    if (t) {
      openTaskSheet(t);
      // opcional: remover taskId da URL após abrir
      try {
        const q = { ...router.query };
        delete q.taskId;
        router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
      } catch {}
    }
    setInitialTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId, loading, tasks]);

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

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setActiveTask(null);
  }

  async function saveTaskPatch() {
    if (!activeTask?.id) return;

    const patch = {
      phase: taskPatch.phase || null,
      responsible_id: taskPatch.responsible_id || null,
      due_date: taskPatch.due_date || null,
      status: taskPatch.status || null,
      notes: taskPatch.notes || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setBulkBusy(true);
      setBulkMsg("");
      const { error: e } = await supabase.from("immersion_tasks").update(patch).eq("id", activeTask.id);
      if (e) throw e;

      await loadTasks();
      setBulkMsg("Tarefa atualizada.");
      setTimeout(() => setBulkMsg(""), 2000);
      closeTaskSheet();
    } catch (e) {
      setBulkMsg(e?.message || "Falha ao salvar a tarefa.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggleDoneActiveTask() {
    if (!activeTask?.id) return;
    const done = isTaskDone(activeTask);
    const patch = done
      ? { status: "Aberta", done_at: null }
      : { status: "Concluída", done_at: new Date().toISOString() };
    try {
      setBulkBusy(true);
      setBulkMsg("");
      const { error: e } = await supabase.from("immersion_tasks").update(patch).eq("id", activeTask.id);
      if (e) throw e;
      await loadTasks();
      setBulkMsg(done ? "Tarefa reaberta." : "Tarefa concluída.");
      setTimeout(() => setBulkMsg(""), 2000);
      closeTaskSheet();
    } catch (e) {
      setBulkMsg(e?.message || "Falha ao atualizar a tarefa.");
    } finally {
      setBulkBusy(false);
    }
  }

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

  async function applyBulk(patch) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    try {
      setBulkBusy(true);
      setBulkMsg("");

      await bulkUpdateTasks(ids, patch);
      await loadTasks();

      setBulkMsg("Alterações aplicadas.");
      setTimeout(() => setBulkMsg(""), 2200);
    } catch (e) {
      setBulkMsg(e?.message || "Falha ao aplicar alterações.");
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
            <label className="label">Responsável</label>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="all">Todos</option>
              {user?.id ? <option value={user.id}>Minhas</option> : null}
              {(profiles || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.name || p.email || p.id).toString()}
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

        <div className="grid" style={{ gap: 6 }}>
          <label className="label">Pendências</label>
          <select className="input" value={triage} onChange={(e) => setTriage(e.target.value)}>
            <option value="all">Todas</option>
            <option value="unassigned">Sem responsável</option>
            <option value="nodue">Sem prazo</option>
            <option value="nophase">Sem fase</option>
          </select>
        </div>

        <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => {
            setQuery("");
            setImmersionId("all");
            setPhase("all");
            setStatus("Pendentes");
            setOwnerId("all");
            setTriage("all");
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
          onClick={() => openTaskSheet(t)}
          aria-label={`Abrir detalhes da tarefa: ${t.title}`}
        >
          <div className="planTaskTitle">{t.title}</div>
          <div className="planTaskMeta" aria-label="Detalhes da tarefa">
            <span className="pill soft">{immLabel}</span>
            <span className="pill soft">{phaseLabel}</span>
            <span className="pill soft">{ownerLabel}</span>
            <span className={t.due_date ? "pill" : "pill soft"}>{dueLabel}</span>
          </div>
        </button>

        <div className="planTaskAside">
          <button
            type="button"
            className="btn ghost"
            style={{ padding: "6px 10px", fontSize: 12 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              saveReturnState();
              router.push(`/imersoes/${t.immersion_id}?from=painel&returnTo=${encodeURIComponent(router.asPath)}`);
            }}
            aria-label={`Abrir imersão da tarefa: ${t.immersion_name || "Imersão"}`}
            title="Abrir imersão"
          >
            Imersão
          </button>
          <span className={sla.className}>{sla.label}</span>
          <span className={isTaskDone(t) ? "badge success" : "badge muted"}>{isTaskDone(t) ? "Concluída" : "Aberta"}</span>
        </div>
      </div>
    );
  }

  function Block({ title, hint, items }) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="sectionHeader">
          <div>
            <h3 className="sectionTitle">{title}</h3>
            {hint ? <div className="small muted">{hint}</div> : null}
          </div>
          <span className="pill">{items.length}</span>
        </div>

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
    );
  }

  const bulkBar = selectedCount > 0 ? (
    <div className="bulkBar" role="region" aria-label="Ações em lote">
      <div className="bulkBarInner">
        <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
          <span className="badge">{selectedCount} selecionada(s)</span>
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

        {bulkMsg ? <div className="small muted" style={{ marginTop: 8 }}>{bulkMsg}</div> : null}
      </div>
    </div>
  ) : null;

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Plano de Ação">
      <div className="container">
        <div className="sectionHeader">
          <div>
            <h2 style={{ margin: 0 }}>Plano de Ação</h2>
            <div className="small muted">Triagem e execução por prioridade (web e mobile)</div>
          </div>

          <div className="row wrap" style={{ gap: 10 }}>

        <div className="quickFilters" role="navigation" aria-label="Atalhos de triagem">
          <button
            type="button"
            className={"chip" + (ownerId === user.id && status === "Pendentes" && triage === "all" && !onlyOverdue ? " active" : "")}
            onClick={() => {
              setOwnerId(user.id);
              setStatus("Pendentes");
              setTriage("all");
              setOnlyOverdue(false);
              loadTasks({ ownerId: user.id, status: "Pendentes", triage: "all", onlyOverdue: false });
            }}
          >
            Minhas
          </button>

          <button
            type="button"
            className={"chip" + (onlyOverdue ? " active" : "")}
            onClick={() => {
              setOwnerId("all");
              setStatus("Pendentes");
              setTriage("all");
              setOnlyOverdue(true);
              loadTasks({ ownerId: "all", status: "Pendentes", triage: "all", onlyOverdue: true });
            }}
          >
            Atrasadas
          </button>

          <button
            type="button"
            className={"chip" + (triage === "unassigned" ? " active" : "")}
            onClick={() => {
              setOwnerId("all");
              setStatus("Pendentes");
              setTriage("unassigned");
              setOnlyOverdue(false);
              loadTasks({ ownerId: "all", status: "Pendentes", triage: "unassigned", onlyOverdue: false });
            }}
          >
            Sem responsável
          </button>

          <button
            type="button"
            className={"chip" + (triage === "nodue" ? " active" : "")}
            onClick={() => {
              setOwnerId("all");
              setStatus("Pendentes");
              setTriage("nodue");
              setOnlyOverdue(false);
              loadTasks({ ownerId: "all", status: "Pendentes", triage: "nodue", onlyOverdue: false });
            }}
          >
            Sem prazo
          </button>

          <button
            type="button"
            className={"chip" + (triage === "nophase" ? " active" : "")}
            onClick={() => {
              setOwnerId("all");
              setStatus("Pendentes");
              setTriage("nophase");
              setOnlyOverdue(false);
              loadTasks({ ownerId: "all", status: "Pendentes", triage: "nophase", onlyOverdue: false });
            }}
          >
            Sem fase
          </button>

          <button
            type="button"
            className={"chip" + (ownerId === "all" && triage === "all" && !onlyOverdue ? " active" : "")}
            onClick={() => {
              setOwnerId("all");
              setStatus("Pendentes");
              setTriage("all");
              setOnlyOverdue(false);
              loadTasks({ ownerId: "all", status: "Pendentes", triage: "all", onlyOverdue: false });
            }}
          >
            Todas
          </button>
        </div>
            <button className="btn onlyDesktop" type="button" onClick={() => setShowFilters(true)}>
              Filtros
            </button>
            <button className="btn onlyMobile" type="button" onClick={() => setShowFilters(true)}>
              Filtros
            </button>
            <button className="btn" type="button" onClick={loadTasks}>
              Atualizar
            </button>
          </div>
        </div>

        {error ? (
          <div className="alert danger" role="status">{error}</div>
        ) : null}

        {loading ? <div className="skeletonList" aria-label="Carregando" /> : null}

        {!loading ? (
          <>
            <Block
              title="Inbox"
              hint="Tarefas sem responsável, sem prazo ou sem fase. Use as ações em lote para triagem rápida."
              items={grouped.inbox}
            />
            <Block
              title="Atrasadas"
              hint="Prioridade máxima. Resolva ou reagende."
              items={grouped.overdue}
            />
            <Block
              title="Vencem hoje"
              hint="Fechamento do dia."
              items={grouped.dueToday}
            />
            <Block
              title="Próximos 7 dias"
              hint="Planejamento imediato."
              items={grouped.next7}
            />
            <Block
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
          open={taskSheetOpen}
          onClose={closeTaskSheet}
          title={activeTask ? "Tarefa" : "Tarefa"}
          footer={
            <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={closeTaskSheet} disabled={bulkBusy}>
                Fechar
              </button>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="button" onClick={toggleDoneActiveTask} disabled={bulkBusy || !activeTask}>
                  {activeTask && isTaskDone(activeTask) ? "Reabrir" : "Concluir"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => copyTaskLink(activeTask)}
                  disabled={bulkBusy || !activeTask}
                  title="Copiar link direto desta tarefa"
                >
                  Copiar link
                </button>
                <button className="btn primary" type="button" onClick={saveTaskPatch} disabled={bulkBusy || !activeTask}>
                  Salvar
                </button>
              </div>
            </div>
          }
        >
          {!activeTask ? (
            <div className="small muted">Nenhuma tarefa selecionada.</div>
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              <div className="grid" style={{ gap: 4 }}>
                <div className="label">Título</div>
                <div style={{ fontWeight: 600 }}>{activeTask.title}</div>
                {copyMsg ? <div className="small" style={{ marginTop: 6 }}>{copyMsg}</div> : null}
              </div>

              <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="pill soft">Imersão: {activeTask.immersion_name || "—"}</span>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    closeTaskSheet();
                    saveReturnState();
                    router.push(`/imersoes/${activeTask.immersion_id}?from=painel&returnTo=${encodeURIComponent(router.asPath)}`);
                  }}
                >
                  Abrir imersão
                </button>
              </div>

              {activeTask.template_item_id ? (
                <div className="small muted">
                  Origem do template: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>{activeTask.template_item_id}</span>
                </div>
              ) : null}

              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Fase</label>
                  <select
                    className="input"
                    value={taskPatch.phase}
                    onChange={(e) => setTaskPatch((p) => ({ ...p, phase: e.target.value }))}
                  >
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
                  <select
                    className="input"
                    value={taskPatch.responsible_id}
                    onChange={(e) => setTaskPatch((p) => ({ ...p, responsible_id: e.target.value }))}
                  >
                    <option value="">Sem responsável</option>
                    {(profiles || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.email || p.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Prazo</label>
                  <input
                    className="input"
                    type="date"
                    value={taskPatch.due_date}
                    onChange={(e) => setTaskPatch((p) => ({ ...p, due_date: e.target.value }))}
                  />
                </div>

                <div className="grid" style={{ gap: 6, flex: 1, minWidth: 220 }}>
                  <label className="label">Status</label>
                  <select
                    className="input"
                    value={taskPatch.status}
                    onChange={(e) => setTaskPatch((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="">(automático)</option>
                    <option value="Aberta">Aberta</option>
                    <option value="Programada">Programada</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Bloqueada">Bloqueada</option>
                    <option value="Concluída">Concluída</option>
                  </select>
                </div>
              </div>

              <div className="grid" style={{ gap: 6 }}>
                <label className="label">Notas</label>
                <textarea
                  className="input"
                  rows={4}
                  value={taskPatch.notes}
                  onChange={(e) => setTaskPatch((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Observações, dependências, links..."
                />
              </div>
            </div>
          )}
        </BottomSheet>
      </div>
    
      <style jsx>{`
        .quickFilters{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:12px;
        }
        .chip{
          border:1px solid var(--color-border-default);
          background: var(--color-surface-2);
          color: var(--color-text-primary);
          padding:8px 10px;
          border-radius: 999px;
          font-size: 13px;
          line-height: 1;
        }
        .chip.active{
          border-color: var(--color-primary);
        }
        .bulkBar{
          position: fixed;
          left: 0;
          right: 0;
          bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
          z-index: 50;
          pointer-events: none;
        }
        .bulkBarInner{
          pointer-events: auto;
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px;
        }
      `}</style>

    </Layout>
  );
}
