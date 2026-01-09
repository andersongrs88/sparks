import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

/**
 * DASHBOARD — HOTFIX
 * Corrige o crash "Minified React error #31" (tentativa de renderizar objeto como filho)
 * tornando o rendering tolerante a campos retornados como objetos (joins do Supabase).
 *
 * Mantém:
 * - KPIs clicáveis
 * - Atalhos para Painel
 * - Próximas imersões com ações
 * - Seções avançadas colapsáveis
 *
 * Depende do endpoint:
 * - GET /api/dashboard/stats
 *   { stats, upcoming, overdue, workload, immersionOptions }
 */

const asText = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  // padrões comuns em joins do Supabase
  if (typeof v === "object") {
    return (
      v.name ||
      v.title ||
      v.label ||
      v.email ||
      v.immersion_name ||
      v.display_name ||
      v.id ||
      ""
    );
  }
  return "";
};

const asId = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.id || "";
  return "";
};

export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, user, role } = useAuth();
  const isAdmin = String(role || "").toLowerCase() === "admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({
    stats: null,
    upcoming: [],
    overdue: [],
    workload: [],
    immersionOptions: []
  });

  const [myStats, setMyStats] = useState({ myOpen: 0, myOverdue: 0 });
  const [myTasksLocal, setMyTasksLocal] = useState([]);

  const [showKpis, setShowKpis] = useState(true);
  const [immersionFilter, setImmersionFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const url = user?.id ? `/api/dashboard/stats?userId=${encodeURIComponent(user.id)}` : "/api/dashboard/stats";
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) throw new Error("Falha ao carregar o dashboard.");
        const j = await res.json();

        if (!mounted) return;

        setPayload({
          stats: j?.stats || null,
          upcoming: Array.isArray(j?.upcoming) ? j.upcoming : [],
          overdue: Array.isArray(j?.overdue) ? j.overdue : [],
          workload: Array.isArray(j?.workload) ? j.workload : [],
          immersionOptions: Array.isArray(j?.immersionOptions) ? j.immersionOptions : []
        });
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar dados.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!user?.id) {
          setMyStats({ myOpen: 0, myOverdue: 0 });
          setMyTasksLocal([]);
          return;
        }
        if (!supabase) return;

        let data = null;
        let error = null;

        // "Minhas" = tarefas em aberto onde eu sou o responsável OR (se não houver responsável) eu fui quem originou (created_by).
        // Nem todas as bases possuem created_by; então tentamos com OR e fazemos fallback.
        try {
          const r = await supabase
            .from("immersion_tasks")
            .select("id,title,phase,due_date,immersion_id,status,done_at,created_by,responsible_id")
            .or(`responsible_id.eq.${user.id},and(responsible_id.is.null,created_by.eq.${user.id})`)
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(200);
          data = r.data;
          error = r.error;
          if (error) throw error;
        } catch (e) {
          // Fallback para bases legadas sem created_by
          const r = await supabase
            .from("immersion_tasks")
            .select("id,title,phase,due_date,immersion_id,status,done_at,responsible_id")
            .eq("responsible_id", user.id)
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(200);
          data = r.data;
          error = r.error;
        }

        if (error) throw error;
        if (!mounted) return;

        const today = toDateOnly(iso(new Date()));
        const open = [];
        for (const t of Array.isArray(data) ? data : []) {
          const st = String(t?.status || "").toLowerCase();
          const done = !!t?.done_at || st === "done" || st === "concluida" || st === "concluída";
          if (done) continue;
          open.push(t);
        }

        let myOverdue = 0;
        for (const t of open) {
          const due = toDateOnly(t?.due_date);
          if (due && today && due.getTime() < today.getTime()) myOverdue += 1;
        }

        setMyTasksLocal(open);
        setMyStats({ myOpen: open.length, myOverdue });
      } catch (e) {
        setMyStats({ myOpen: 0, myOverdue: 0 });
        setMyTasksLocal([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);


  const stats = useMemo(() => {
    const s = payload?.stats;
    return {
      totalImmersions: s?.totalImmersions ?? 0,
      totalTasks: s?.totalTasks ?? 0,
      overdueTasks: s?.overdueTasks ?? s?.lateTasks ?? 0,
      doneTasks: s?.doneTasks ?? 0,
      myOpen: s?.myOpen ?? myStats.myOpen ?? 0,
      myOverdue: s?.myOverdue ?? myStats.myOverdue ?? 0
    };
  }, [payload, myStats]);

  const immersionOptions = useMemo(() => payload?.immersionOptions || [], [payload]);
  const overdue = useMemo(() => payload?.overdue || [], [payload]);
  const upcoming = useMemo(() => payload?.upcoming || [], [payload]);
  const workload = useMemo(() => payload?.workload || [], [payload]);

  const myTasks = useMemo(() => {
    if (Array.isArray(myTasksLocal) && myTasksLocal.length) return myTasksLocal.slice(0, 6);
    if (Array.isArray(payload?.myTasks)) return payload.myTasks;
    return overdue.slice(0, 6);
  }, [payload, overdue, myTasksLocal]);

  const goPainel = (q = {}) => router.push({ pathname: "/painel", query: q });

  const goImmersion = (immersionId, returnTo) => {
    const id = asId(immersionId);
    if (!id) return;
    const query = returnTo ? { returnTo } : undefined;
    router.push({ pathname: `/imersoes/${id}`, query });
  };

  const taskLink = (t) => {
    const immersionId = asId(t?.immersion_id || t?.immersion || t?.immersionId);
    const taskId = asId(t?.id || t?.task_id || t?.taskId);
    const q = {};
    if (immersionId) q.immersionId = immersionId;
    if (taskId) q.taskId = taskId;
    return { pathname: "/painel", query: q };
  };

  const openTask = (t) => router.push(taskLink(t));

  const filteredUpcoming = useMemo(() => {
    if (!immersionFilter || immersionFilter === "all") return upcoming;
    return upcoming.filter((u) => asId(u?.immersion_id || u?.id) === immersionFilter);
  }, [upcoming, immersionFilter]);

  return (
    <Layout title="Dashboard" subtitle="Planejamento, execução e controle com base no Educagrama">
      <div className="dashWrap">
        <div className="dashTop">
          <div>
            <div className="muted small">Indicadores do sistema</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn small onlyMobile" type="button" onClick={() => setShowKpis((v) => !v)}>
              {showKpis ? "Ocultar KPIs" : "Mostrar KPIs"}
            </button>
            <button className="btn small ghost" type="button" onClick={() => router.push("/painel")}>
              Abrir Painel
            </button>
          </div>
        </div>

        {error ? (
          <div className="card compact">
            <div className="badge danger">Erro</div>
            <div style={{ marginTop: 8 }}>{error}</div>
          </div>
        ) : null}

        {showKpis ? (
          <section className="kpiGridCompact" aria-label="KPIs do sistema">
            <button className="kpi" type="button" onClick={() => router.push("/imersoes")} title="Abrir Imersões">
              <div className="kpiLabel">Imersões</div>
              <div className="kpiValue">{stats.totalImmersions}</div>
              <div className="kpiMeta">Acessar lista</div>
            </button>

            <button className="kpi" type="button" onClick={() => goPainel({})} title="Abrir Painel">
              <div className="kpiLabel">Tarefas</div>
              <div className="kpiValue">{stats.totalTasks}</div>
              <div className="kpiMeta">Abrir execução</div>
            </button>

            <button className="kpi kpiAlert" type="button" onClick={() => goPainel({ view: "overdue" })} title="Ver atrasadas no Painel">
              <div className="kpiLabel">Atrasadas</div>
              <div className="kpiValue">{stats.overdueTasks}</div>
              <div className="kpiMeta">Prioridade máxima</div>
            </button>

            <button className="kpi kpiOk" type="button" onClick={() => goPainel({ view: "done" })} title="Ver concluídas no Painel">
              <div className="kpiLabel">Concluídas</div>
              <div className="kpiValue">{stats.doneTasks}</div>
              <div className="kpiMeta">Entregas</div>
            </button>

            <button className="kpi kpiMuted" type="button" onClick={() => goPainel({ view: "minhas" })} title="Abrir minhas tarefas">
              <div className="kpiLabel">Minhas</div>
              <div className="kpiValue">{stats.myOpen}</div>
              <div className="kpiMeta">Em aberto</div>
            </button>

            <button className="kpi kpiWarn" type="button" onClick={() => goPainel({ view: "overdue", mine: "1" })} title="Abrir minhas atrasadas">
              <div className="kpiLabel">Minhas atrasadas</div>
              <div className="kpiValue">{stats.myOverdue}</div>
              <div className="kpiMeta">Ação imediata</div>
            </button>
          </section>
        ) : null}

        <div className="dashGrid">
          <section className="card compact" aria-label="Atalhos e minhas tarefas">
            <div className="sectionHeaderCompact">
              <div>
                <h3 className="h3">Atalhos</h3>
                <div className="muted small">Triagem rápida</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn small" type="button" onClick={() => goPainel({ view: "minhas" })}>Minhas</button>
                <button className="btn small" type="button" onClick={() => goPainel({ view: "inbox" })}>Inbox</button>
                <button className="btn small" type="button" onClick={() => goPainel({ view: "overdue" })}>Atrasadas</button>
              </div>
            </div>

            <div className="row wrap" style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className="muted small">Imersão</span>
                <select className="input inputSmall" value={immersionFilter} onChange={(e) => setImmersionFilter(e.target.value)}>
                  <option value="all">Todas</option>
                  {immersionOptions.map((im) => {
                    const id = asId(im?.id);
                    const name = asText(im?.immersion_name || im?.name) || id;
                    return <option key={id} value={id}>{name}</option>;
                  })}
                </select>
              </div>

              <button
                className="btn small ghost"
                type="button"
                onClick={() => goPainel({ immersionId: immersionFilter !== "all" ? immersionFilter : undefined })}
              >
                Abrir Painel filtrado
              </button>

              <button
                className="btn small"
                type="button"
                disabled={immersionFilter === "all"}
                title={immersionFilter === "all" ? "Selecione uma imersão para abrir suas tarefas." : "Abrir tarefas da imersão"}
                onClick={() => {
                  if (immersionFilter === "all") return;
                  router.push(`/imersoes/${immersionFilter}/tarefas`);
                }}
              >
                Abrir Tarefas
              </button>
            </div>

            <div className="divider" />

            <div className="sectionHeaderCompact" style={{ marginTop: 4 }}>
              <div>
                <h3 className="h3">Pendências em foco</h3>
                <div className="muted small">Amostra (até 6)</div>
              </div>
              <button className="btn small" type="button" onClick={() => goPainel({ view: "overdue" })}>
                Ver tudo
              </button>
            </div>

            {!loading && myTasks.length === 0 ? (
              <div className="empty">
                <strong>Nenhuma tarefa pendente</strong>
                <div className="muted small" style={{ marginTop: 6 }}>
                  Você está em dia. Use o Painel para filtrar por outras imersões.
                </div>
              </div>
            ) : (
              <div className="miniList" role="list">
                {myTasks.map((t) => {
                  const key = asId(t?.id || t?.task_id) || Math.random().toString(36).slice(2);
                  const title = asText(t?.title) || "Tarefa";
                  const phase = asText(t?.phase) || "-";
                  const due = asText(t?.due_date) || "";
                  return (
                    <button
                      key={key}
                      type="button"
                      className="miniRow"
                      onClick={() => openTask(t)}
                      title="Abrir tarefa no Painel"
                    >
                      <div className="miniTitle">{title}</div>
                      <div className="miniMeta">
                        <span className="badge muted">{phase}</span>
                        {due ? <span className="badge danger">{due}</span> : <span className="badge muted">Sem prazo</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card compact" aria-label="Próximas imersões">
            <div className="sectionHeaderCompact">
              <div>
                <h3 className="h3">Próximas imersões</h3>
                <div className="muted small">Planejamento e status operacional</div>
              </div>
              <button className="btn small ghost" type="button" onClick={() => router.push("/imersoes")}>
                Ver todas
              </button>
            </div>

            {!loading && filteredUpcoming.length === 0 ? (
              <div className="empty">
                <strong>Nenhuma imersão encontrada</strong>
                <div className="muted small" style={{ marginTop: 6 }}>
                  Ajuste o filtro de imersão ou crie uma nova imersão.
                </div>
              </div>
            ) : (
              <div className="list" role="list">
                {filteredUpcoming.slice(0, 8).map((im) => {
                  const immersionId = asId(im?.immersion_id || im?.id);
                  const title = asText(im?.immersion_name || im?.name) || "Imersão";
                  const start = asText(im?.start_date || im?.startDate) || "-";
                  const end = asText(im?.end_date || im?.endDate) || "-";
                  const phase = asText(im?.phase || im?.status) || "Planejamento";
                  const next = asText(im?.next_action || im?.nextAction) || "";

                  return (
                    <div className="immRow" key={immersionId} role="listitem">
                      <div className="immMain">
                        <div className="immTitle">{title}</div>
                        <div className="immMeta">
                          {start} → {end} • {phase}
                        </div>
                        {next ? <div className="immNext">Próxima ação: {next}</div> : null}
                      </div>
                      <div className="immActions">
                        <button className="btn small" type="button" onClick={() => goPainel({ immersionId })}>
                          Abrir painel
                        </button>
                        <button className="btn small ghost" type="button" onClick={() => goImmersion(immersionId, router.asPath)}>
                          Abrir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="dashBottom">
          {isAdmin && (
            <details className="card compact" open={true}>
              <summary className="summaryRow">
                <span style={{ fontWeight: 750 }}>Demanda por responsável</span>
                <span className="muted small">Visão de gargalos</span>
              </summary>

            {workload.length > 0 ? (
              <div className="tableWrap compactTable">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Abertas</th>
                      <th>Atrasadas</th>
                      <th>Vencem (3d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workload.map((w, idx) => {
                      const key = asId(w?.responsible_id) || asText(w?.responsible) || String(idx);
                      const responsible = asText(w?.responsible) || asText(w?.profile) || asText(w?.user) || "—";
                      const open = Number(w?.open ?? 0);
                      const overdueN = Number(w?.overdue ?? 0);
                      const dueSoon = Number(w?.dueSoon ?? w?.due_soon ?? 0);

                      const sev = overdueN >= 10 || (open >= 30 && overdueN >= 6) ? "critical" : overdueN >= 5 || open >= 20 ? "warn" : "ok";
                      const rowStyle = sev === "critical"
                        ? { background: "var(--color-danger-soft)" }
                        : sev === "warn"
                          ? { background: "var(--color-warning-soft)" }
                          : undefined;

                      return (
                        <tr key={key} style={rowStyle}>
                          <td>
                            <div style={{ fontWeight: 800 }}>{responsible}</div>
                            {sev === "critical" ? (
                              <div className="small" style={{ marginTop: 4 }}>
                                <span className="badge danger">Crítico</span>
                              </div>
                            ) : sev === "warn" ? (
                              <div className="small" style={{ marginTop: 4 }}>
                                <span className="badge warn">Atenção</span>
                              </div>
                            ) : (
                              <div className="small muted" style={{ marginTop: 4 }}>Normal</div>
                            )}
                          </td>
                          <td><span className={sev === "critical" ? "badge danger" : sev === "warn" ? "badge warn" : "badge"}>{open}</span></td>
                          <td><span className={overdueN ? "badge danger" : "badge muted"}>{overdueN}</span></td>
                          <td><span className={dueSoon ? (sev === "critical" ? "badge danger" : sev === "warn" ? "badge warn" : "badge") : "badge muted"}>{dueSoon}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 8 }}>Sem dados de carga no momento.</div>
            )}
            </details>
          )}

          



        </div>
      </div>

      <style jsx>{`
        /*
          Em telas largas, o dashboard precisa usar a largura disponível
          (especialmente nos "cards" de cabeçalho/indicadores) para evitar
          sensação de espaço desperdiçado.
        */
        .dashWrap { width: 100%; max-width: none; margin: 0; }
        .dashTop { display:flex; align-items:center; justify-content:space-between; gap:12px; margin: 4px 0 12px; }

        .kpiGridCompact {
          display:grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
        }

        .kpi {
          text-align:left;
          border-radius: 12px;
          padding: 12px 14px;
          border: 1px solid var(--color-border-default);
          background: var(--color-surface-1);
          cursor: pointer;
          transition: transform .08s ease, border-color .12s ease;
        }
        .kpi:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.18); }
        .kpi:focus { outline: 2px solid rgba(125, 211, 252, 0.35); outline-offset: 2px; }

        .kpiLabel { font-size: 12px; opacity: .75; }
        .kpiValue { font-size: 22px; font-weight: 850; line-height: 1.1; margin-top: 6px; }
        .kpiMeta { font-size: 12px; opacity: .70; margin-top: 4px; }

        .kpiAlert { background: rgba(255, 77, 77, 0.08); border-color: rgba(255, 77, 77, 0.22); }
        .kpiOk { background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.22); }
        .kpiMuted { background: rgba(255, 255, 255, 0.03); }
        .kpiWarn { background: rgba(245, 158, 11, 0.10); border-color: rgba(245, 158, 11, 0.22); }

        .dashGrid {
          display:grid;
          grid-template-columns: 360px minmax(0, 1fr);
          gap: 12px;
          margin-top: 12px;
          align-items: start;
        }

        .card.compact { padding: 12px; }
        .sectionHeaderCompact { display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; }
        .h3 { margin: 0; font-size: 14px; font-weight: 850; line-height: 1.2; }

        .inputSmall { height: 34px; padding: 6px 10px; font-size: 13px; }
        .divider { height: 1px; background: var(--color-border-default); opacity: .65; margin: 12px 0; }

        .empty { border: 1px dashed var(--color-border-default); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.02); }

        .miniList { display:flex; flex-direction:column; gap: 8px; margin-top: 10px; }
        .miniRow {
          text-align:left;
          border: 1px solid var(--color-border-default);
          background: var(--color-surface-2);
          border-radius: 12px;
          padding: 10px 10px;
          cursor: pointer;
        }
        .miniRow:hover { border-color: rgba(255,255,255,0.18); }
        .miniTitle { font-weight: 800; font-size: 13px; line-height: 1.2; }
        .miniMeta { margin-top: 6px; display:flex; gap: 8px; flex-wrap: wrap; }

        .list { display:flex; flex-direction:column; gap: 10px; margin-top: 12px; }
        .immRow {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap: 12px;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid var(--color-border-default);
          background: var(--color-surface-2);
        }
        .immMain { min-width: 0; }
        .immTitle { font-weight: 850; font-size: 14px; line-height: 1.2; }
        .immMeta { font-size: 12px; opacity: .72; margin-top: 4px; }
        .immNext { font-size: 12px; margin-top: 6px; opacity: .9; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 640px; }
        .immActions { display:flex; gap: 8px; flex-wrap: wrap; justify-content:flex-end; }

        .dashBottom { margin-top: 12px; display:flex; flex-direction:column; gap: 12px; }
        .summaryRow { display:flex; align-items:center; justify-content:space-between; gap: 12px; cursor: pointer; }
        .summaryRow::-webkit-details-marker { display:none; }

        .compactTable { margin-top: 10px; }
        .linkBtn {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .linkBtn:hover { opacity: .85; }

        @media (max-width: 980px) {
          .kpiGridCompact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dashGrid { grid-template-columns: 1fr; }
          .immNext { max-width: 100%; }
        }
      `}</style>
    </Layout>
  );
}
