import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { sortTasksByPriority } from "../lib/tasks";
import { AREAS, roleLabel } from "../lib/permissions";

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}



function fmtDue(dateStr) {
  if (!dateStr) return "Sem prazo";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return String(dateStr);
  }
}

function isOverdueTask(t) {
  if (!t?.due_date) return false;
  if (t?.status === "Concluída") return false;
  return new Date(t.due_date).getTime() < Date.now();
}
export default function PainelPage() {
  const router = useRouter();
  const { loading: authLoading, user, role, isFullAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [immersions, setImmersions] = useState([]);

  const [area, setArea] = useState("eventos");
  const [immersionId, setImmersionId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pendentes"); // pendentes | todas | concluidas
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState("lista"); // lista | kanban
  const [draggingId, setDraggingId] = useState("");
  const [dragOverStatus, setDragOverStatus] = useState("");


  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Inicializa área padrão
  useEffect(() => {
    if (authLoading || !user) return;
    if (!isFullAccess && AREAS.includes(role)) setArea(role);
    if (!isFullAccess && !AREAS.includes(role)) router.replace("/dashboard");
  }, [authLoading, user, role, isFullAccess, router]);

  // Carrega lista de imersões para filtro
  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("immersions")
          .select("id, name, start_date, status")
          .order("start_date", { ascending: false })
          .limit(300);
        if (err) throw err;
        if (!mounted) return;
        setImmersions(data ?? []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  // Carrega tarefas (painel)
  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    (async () => {
      try {
        setError("");
        setLoading(true);

        const areaToUse = isFullAccess ? area : role;

        let query = supabase
          .from("immersion_tasks")
          .select(
            "id, immersion_id, title, area, phase, status, due_date, evidence_link, evidence_path, updated_at, created_at, immersions(name, start_date, status)"
          )
          .eq("area", areaToUse)
          .order("due_date", { ascending: true, nullsFirst: false });

        if (immersionId !== "all") query = query.eq("immersion_id", immersionId);
        if (statusFilter === "pendentes") query = query.neq("status", "Concluída");
        if (statusFilter === "concluidas") query = query.eq("status", "Concluída");

        const { data, error: err } = await query.limit(500);
        if (err) throw err;
        if (!mounted) return;
        setTasks(data ?? []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar painel.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, user, role, isFullAccess, area, immersionId, statusFilter]);

  const filtered = useMemo(() => {
    const text = normalize(q);
    const now = new Date();

    return (tasks || []).filter((t) => {
      if (onlyOverdue) {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        if (!(due.getTime() < now.getTime()) || t.status === "Concluída") return false;
      }
      if (!text) return true;
      const hay = `${t.title} ${t?.immersions?.name || ""} ${t.phase || ""} ${t.status || ""}`;
      return normalize(hay).includes(text);
    });
  }, [tasks, q, onlyOverdue]);

  const prioritized = useMemo(() => sortTasksByPriority(filtered), [filtered]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of prioritized) {
      const key = t.immersion_id;
      if (!map.has(key)) {
        map.set(key, {
          immersion_id: key,
          immersion_name: t?.immersions?.name || "(Sem nome)",
          start_date: t?.immersions?.start_date || null,
          immersion_status: t?.immersions?.status || null,
          items: []
        });
      }
      map.get(key).items.push(t);
    }
    for (const g of map.values()) {
      g.items = sortTasksByPriority(g.items);
    }
    return Array.from(map.values()).sort((a, b) => {
      const ad = a.start_date ? new Date(a.start_date).getTime() : 0;
      const bd = b.start_date ? new Date(b.start_date).getTime() : 0;
      return bd - ad;
    });
  }, [prioritized]);


  const kanban = useMemo(() => {
    const cols = [];
    const wantDone = statusFilter === "todas";
    const wantPending = statusFilter !== "concluidas";
    if (wantPending) {
      cols.push({ key: "Programada", title: "Programada" });
      cols.push({ key: "Em andamento", title: "Em andamento" });
    }
    if (wantDone) cols.push({ key: "Concluída", title: "Concluída" });
    if (statusFilter === "concluidas") cols.push({ key: "Concluída", title: "Concluída" });

    const map = new Map();
    for (const c of cols) map.set(c.key, []);
    for (const t of prioritized) {
      const k = t.status || "Programada";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }

    const out = cols.map((c) => ({
      ...c,
      items: sortTasksByPriority(map.get(c.key) || []),
    }));
    return out;
  }, [prioritized, statusFilter]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((t) => t.status === "Concluída").length;
    const late = filtered.filter((t) => {
      if (!t.due_date) return false;
      if (t.status === "Concluída") return false;
      return new Date(t.due_date).getTime() < Date.now();
    }).length;
    return { total, done, late };
  }, [prioritized]);


  const PHASE_LABEL = { "PA-PRE": "PA-PRÉ", DURANTE: "DURANTE", POS: "PÓS" };

  const phaseSummary = useMemo(() => {
    const phases = ["PA-PRE", "DURANTE", "POS"];
    const base = {};
    for (const p of phases) base[p] = { total: 0, done: 0, late: 0 };
    for (const t of prioritized) {
      const k = t.phase || "PA-PRE";
      if (!base[k]) base[k] = { total: 0, done: 0, late: 0 };
      base[k].total += 1;
      if (t.status === "Concluída") base[k].done += 1;
      if (isOverdueTask(t)) base[k].late += 1;
    }
    return base;
  }, [prioritized]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Painel">
      <div className="container">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Painel por área</h3>
              <div style={{ opacity: 0.8, fontSize: 12 }}>
                {isFullAccess ? "Selecione a área e filtre as tarefas." : `Área: ${roleLabel(role)}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {isFullAccess ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>Área</span>
                  <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>{roleLabel(a)}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Imersão</span>
                <select className="input" value={immersionId} onChange={(e) => setImmersionId(e.target.value)}>
                  <option value="all">Todas</option>
                  {(immersions || []).map((im) => (
                    <option key={im.id} value={im.id}>{im.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Status</span>
                <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="pendentes">Pendentes</option>
                  <option value="todas">Todas</option>
                  <option value="concluidas">Concluídas</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              placeholder="Buscar por tarefa, fase ou imersão..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.9 }}>
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
              Somente atrasadas
            </label>
            <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.9 }}>
              Total: <b>{totals.total}</b> • Atrasadas: <b>{totals.late}</b> • Concluídas: <b>{totals.done}</b>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>Visão:</span>
                <button
                  className="btn"
                  onClick={() => setViewMode("lista")}
                  style={{ opacity: viewMode === "lista" ? 1 : 0.7 }}
                  type="button"
                >
                  Lista
                </button>
                <button
                  className="btn"
                  onClick={() => setViewMode("kanban")}
                  style={{ opacity: viewMode === "kanban" ? 1 : 0.7 }}
                  type="button"
                >
                  Kanban
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, opacity: 0.85 }}>Por fase:</span>
                {["PA-PRE", "DURANTE", "POS"].map((p) => (
                  <span
                    key={p}
                    style={{
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      opacity: 0.95,
                    }}
                  >
                    <b>{PHASE_LABEL[p]}</b> — {phaseSummary?.[p]?.done || 0}/{phaseSummary?.[p]?.total || 0}
                    {phaseSummary?.[p]?.late ? <span style={{ opacity: 0.85 }}> • {phaseSummary[p].late} atras.</span> : null}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {error ? <p style={{ color: "#ff6b6b" }}>{error}</p> : null}
          {loading ? <p>Carregando...</p> : null}

          {!loading && grouped.length === 0 ? (
            <p style={{ opacity: 0.8, marginTop: 12 }}>Nenhuma tarefa encontrada para os filtros selecionados.</p>
          ) : null}

          {viewMode === "lista" ? (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {grouped.map((g) => {
                const phaseStats = ["PA-PRE", "DURANTE", "POS"].reduce((acc, p) => {
                  acc[p] = { total: 0, done: 0, late: 0 };
                  return acc;
                }, {});
                for (const t of g.items) {
                  const k = t.phase || "PA-PRE";
                  if (!phaseStats[k]) phaseStats[k] = { total: 0, done: 0, late: 0 };
                  phaseStats[k].total += 1;
                  if (t.status === "Concluída") phaseStats[k].done += 1;
                  if (isOverdueTask(t)) phaseStats[k].late += 1;
                }

                return (
                  <div key={g.immersion_id} className="card" style={{ margin: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{g.immersion_name}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          Início: {g.start_date ? new Date(g.start_date).toLocaleDateString("pt-BR") : "—"} • Status: {g.immersion_status || "—"}
                        </div>
                      </div>
                      <button className="btn" type="button" onClick={() => router.push(`/imersoes/${g.immersion_id}`)}>
                        Abrir imersão
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {["PA-PRE", "DURANTE", "POS"].map((p) => (
                        <span
                          key={p}
                          style={{
                            border: "1px solid rgba(255,255,255,0.16)",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            opacity: 0.95,
                          }}
                        >
                          <b>{PHASE_LABEL[p]}</b> — {phaseStats[p]?.done || 0}/{phaseStats[p]?.total || 0}
                          {phaseStats[p]?.late ? <span style={{ opacity: 0.85 }}> • {phaseStats[p].late} atras.</span> : null}
                        </span>
                      ))}
                    </div>

                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      {g.items.map((t) => (
                        <div
                          key={t.id}
                          className="card"
                          style={{
                            margin: 0,
                            borderColor: isOverdueTask(t) ? "rgba(255,107,107,0.55)" : "rgba(255,255,255,0.12)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontWeight: 650 }}>{t.title}</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                {PHASE_LABEL[t.phase] || t.phase || "—"} • {t.status || "—"} • Prazo: <b>{fmtDue(t.due_date)}</b>
                                {isOverdueTask(t) ? <span style={{ marginLeft: 8, color: "#ff6b6b" }}>Atrasada</span> : null}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              {t.evidence_link ? (
                                <a className="btn" href={t.evidence_link} target="_blank" rel="noreferrer">
                                  Evidência
                                </a>
                              ) : (
                                <span style={{ fontSize: 12, opacity: 0.7 }}>Sem evidência</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                {kanban.map((col) => (
                  <div
                    key={col.key}
                    className="card"
                    style={{
                      margin: 0,
                      borderColor:
                        dragOverStatus === col.key
                          ? "rgba(255,255,255,0.35)"
                          : "rgba(255,255,255,0.12)",
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverStatus(col.key);
                    }}
                    onDragLeave={() => setDragOverStatus("")}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setDragOverStatus("");
                      const taskId = e.dataTransfer.getData("text/task-id");
                      const fromStatus = e.dataTransfer.getData("text/from-status");
                      const toStatus = col.key;
                      if (!taskId) return;
                      if (fromStatus === toStatus) return;

                      const task = (tasks || []).find((x) => String(x.id) === String(taskId));
                      if (!task) return;

                      // Permissão: full access pode tudo; área só pode mover tarefas da própria área
                      const canMove =
                        isFullAccess || (AREAS.includes(role) && task.area === role);

                      if (!canMove) {
                        setError("Você não tem permissão para mover esta tarefa.");
                        return;
                      }

                      // Atualização otimista
                      const prev = tasks;
                      setTasks((cur) =>
                        (cur || []).map((x) =>
                          String(x.id) === String(taskId) ? { ...x, status: toStatus } : x
                        )
                      );

                      const { error: err } = await supabase
                        .from("immersion_tasks")
                        .update({ status: toStatus })
                        .eq("id", taskId);

                      if (err) {
                        // rollback
                        setTasks(prev);
                        setError(err.message || "Falha ao mover tarefa.");
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 800 }}>{col.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{col.items.length}</div>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {col.items.length === 0 ? (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Arraste itens para cá</div>
                      ) : null}

                      {col.items.map((t) => {
                        const canDrag = isFullAccess || (AREAS.includes(role) && t.area === role);
                        return (
                          <div
                            key={t.id}
                            className="card"
                            draggable={canDrag}
                            onDragStart={(e) => {
                              if (!canDrag) return;
                              e.dataTransfer.setData("text/task-id", String(t.id));
                              e.dataTransfer.setData("text/from-status", String(t.status || "Programada"));
                              setDraggingId(String(t.id));
                            }}
                            onDragEnd={() => setDraggingId("")}
                            style={{
                              margin: 0,
                              cursor: canDrag ? "grab" : "not-allowed",
                              opacity: draggingId === String(t.id) ? 0.75 : 1,
                              borderColor: isOverdueTask(t)
                                ? "rgba(255,107,107,0.55)"
                                : "rgba(255,255,255,0.12)",
                            }}
                            onClick={() => router.push(`/imersoes/${t.immersion_id}`)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") router.push(`/imersoes/${t.immersion_id}`);
                            }}
                          >
                            <div style={{ fontWeight: 650 }}>{t.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                              <b>{t?.immersions?.name || "Imersão"}</b>
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                              {PHASE_LABEL[t.phase] || t.phase || "—"} • Prazo: <b>{fmtDue(t.due_date)}</b>
                              {isOverdueTask(t) ? (
                                <span style={{ marginLeft: 8, color: "#ff6b6b" }}>Atrasada</span>
                              ) : null}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                              {canDrag ? "Arraste para mudar status" : "Sem permissão para mover"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
