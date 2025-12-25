import { useEffect, useMemo, useState } from "react";
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
  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);

  const [query, setQuery] = useState("");
  const [immersionId, setImmersionId] = useState("all");
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("Pendentes");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const [immersionOptions, setImmersionOptions] = useState([]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const selectedCount = selectedIds.size;

  const [showFilters, setShowFilters] = useState(false);

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

  async function loadTasks() {
    try {
      setError("");
      setLoading(true);

      // Governança: tenta manter atrasadas sinalizadas (best-effort)
      try {
        await syncOverdueTasksGlobal();
      } catch {}

      // Select compatível com bases antigas
      const base = "id, immersion_id, title, phase, status, due_date, done_at, notes, responsible_id, created_at, updated_at, immersions(immersion_name)";
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
    return (
      <div className="listItem" style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 10, alignItems: "center" }}>
        <input
          aria-label="Selecionar tarefa"
          type="checkbox"
          checked={selectedIds.has(t.id)}
          onChange={() => toggleSelected(t.id)}
        />

        <button
          type="button"
          className="listItemMain"
          style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          onClick={() => router.push(`/imersoes/${t.immersion_id}`)}
        >
          <div className="listItemTitle">{t.title}</div>
          <div className="listItemMeta">
            {t.immersion_name ? `Imersão: ${t.immersion_name} • ` : ""}
            {t.phase ? `Fase: ${t.phase} • ` : "Sem fase • "}
            {t.responsible_id ? `Responsável: ${profileLabelById.get(t.responsible_id) || t.responsible_id}` : "Sem responsável"}
            {t.due_date ? ` • Prazo: ${t.due_date}` : " • Sem prazo"}
          </div>
        </button>

        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
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
      </div>
    </Layout>
  );
}
