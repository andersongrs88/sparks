import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";

/**
 * DASHBOARD (corrigido)
 * Objetivo:
 * - Visual compacto (SaaS) e operável
 * - KPIs clicáveis (levam ao Painel)
 * - Lista de próximas imersões com ações (Abrir painel / Abrir imersão)
 * - Atalhos de triagem (Inbox / Atrasadas / Minhas)
 * - Deep-link consistente para tarefa: /painel?immersionId=...&taskId=...
 *
 * Depende do endpoint:
 * - GET /api/dashboard/stats
 *   Retorna: { stats, upcoming, overdue, riskImmersions, workload, immersionOptions }
 */

export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ stats: null, upcoming: [], overdue: [], riskImmersions: [], workload: [], immersionOptions: [] });

  const [showKpis, setShowKpis] = useState(true);
  const [immersionFilter, setImmersionFilter] = useState("all");

  // ----- Fetch
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/dashboard/stats", { method: "GET" });
        if (!res.ok) throw new Error("Falha ao carregar o dashboard.");
        const j = await res.json();

        if (!mounted) return;

        setPayload({
          stats: j?.stats || null,
          upcoming: j?.upcoming || [],
          overdue: j?.overdue || [],
          riskImmersions: j?.riskImmersions || [],
          workload: j?.workload || [],
          immersionOptions: j?.immersionOptions || []
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

  const stats = useMemo(() => {
    const s = payload?.stats;
    return {
      totalImmersions: s?.totalImmersions ?? 0,
      totalTasks: s?.totalTasks ?? 0,
      overdueTasks: s?.overdueTasks ?? 0,
      doneTasks: s?.doneTasks ?? 0,
      myOpen: s?.myOpen ?? 0,
      myOverdue: s?.myOverdue ?? 0
    };
  }, [payload]);

  const immersionOptions = useMemo(() => payload?.immersionOptions || [], [payload]);
  const overdue = useMemo(() => payload?.overdue || [], [payload]);
  const upcoming = useMemo(() => payload?.upcoming || [], [payload]);
  const riskImmersions = useMemo(() => payload?.riskImmersions || [], [payload]);
  const workload = useMemo(() => payload?.workload || [], [payload]);

  // "Minhas tarefas" (você pode adaptar o backend para retornar uma lista)
  // No estado atual, usamos as tarefas atrasadas como amostra quando filtrado.
  const myTasks = useMemo(() => {
    // Se o backend já retornar myTasks, use-o.
    if (Array.isArray(payload?.myTasks)) return payload.myTasks;

    // fallback: tarefas atrasadas (limitadas) como “pendências”
    const base = Array.isArray(overdue) ? overdue : [];
    const limited = base.slice(0, 6);
    return limited;
  }, [payload, overdue]);

  // ----- Helpers
  const goPainel = (q = {}) => {
    router.push({ pathname: "/painel", query: q });
  };

  const goImmersion = (immersionId, returnTo) => {
    if (!immersionId) return;
    const query = returnTo ? { returnTo } : undefined;
    router.push({ pathname: `/imersoes/${immersionId}`, query });
  };

  const taskLink = (t) => {
    const immersionId = t?.immersion_id || t?.immersionId || t?.immersion;
    const taskId = t?.id || t?.task_id || t?.taskId;
    const q = {};
    if (immersionId) q.immersionId = immersionId;
    if (taskId) q.taskId = taskId;
    return { pathname: "/painel", query: q };
  };

  const openTask = (t) => {
    const link = taskLink(t);
    router.push(link);
  };

  const filteredUpcoming = useMemo(() => {
    if (!immersionFilter || immersionFilter === "all") return upcoming;
    return (upcoming || []).filter((u) => (u?.immersion_id || u?.id) === immersionFilter);
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

            {/* KPIs pessoais (quando disponíveis) */}
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
          {/* LEFT: Atalhos / Minhas tarefas */}
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
                  {immersionOptions.map((im) => (
                    <option key={im.id} value={im.id}>{im.immersion_name}</option>
                  ))}
                </select>
              </div>

              <button className="btn small ghost" type="button" onClick={() => goPainel({ immersionId: immersionFilter !== "all" ? immersionFilter : undefined })}>
                Abrir Painel filtrado
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
                {myTasks.map((t) => (
                  <button
                    key={t.id || t.task_id}
                    type="button"
                    className="miniRow"
                    onClick={() => openTask(t)}
                    title="Abrir tarefa no Painel"
                  >
                    <div className="miniTitle">{t.title}</div>
                    <div className="miniMeta">
                      <span className="badge muted">{t.phase || "-"}</span>
                      {t.due_date ? <span className="badge danger">{t.due_date}</span> : <span className="badge muted">Sem prazo</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* RIGHT: Próximas imersões */}
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
                  const immersionId = im?.immersion_id || im?.id;
                  const title = im?.immersion_name || im?.name || "Imersão";
                  const start = im?.start_date || im?.startDate || "-";
                  const end = im?.end_date || im?.endDate || "-";
                  const phase = im?.phase || im?.status || "Planejamento";
                  const next = im?.next_action || im?.nextAction || "";

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
                        <button
                          className="btn small ghost"
                          type="button"
                          onClick={() => goImmersion(immersionId, encodeURIComponent(router.asPath))}
                        >
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

        {/* Bottom: Informações avançadas (compactas / colapsáveis) */}
        <div className="dashBottom">
          <details className="card compact" open={false}>
            <summary className="summaryRow">
              <span style={{ fontWeight: 750 }}>Carga por responsável</span>
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
                    {workload.map((w) => (
                      <tr key={w.responsible_id || w.responsible}>
                        <td>
                          <div style={{ fontWeight: 800 }}>{w.responsible}</div>
                          {w.overdue >= 10 ? (
                            <div className="small" style={{ marginTop: 4 }}><span className="badge danger">Carga crítica</span></div>
                          ) : (
                            <div className="small muted" style={{ marginTop: 4 }}>Carga normal</div>
                          )}
                        </td>
                        <td><span className="badge">{w.open}</span></td>
                        <td><span className={w.overdue ? "badge danger" : "badge muted"}>{w.overdue}</span></td>
                        <td><span className={w.dueSoon ? "badge" : "badge muted"}>{w.dueSoon}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 8 }}>Sem dados de carga no momento.</div>
            )}
          </details>

          <details className="card compact" open={false}>
            <summary className="summaryRow">
              <span style={{ fontWeight: 750 }}>Tarefas atrasadas</span>
              <span className="muted small">Amostra operacional</span>
            </summary>

            {overdue.length > 0 ? (
              <div className="tableWrap compactTable">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Imersão</th>
                      <th>Tarefa</th>
                      <th>Fase</th>
                      <th>Atraso</th>
                      <th>Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdue.slice(0, 25).map((t) => (
                      <tr key={t.id || t.task_id}>
                        <td>
                          <button className="linkBtn" type="button" onClick={() => goPainel({ immersionId: t.immersion_id })}>
                            {t.immersion_name || "Ver"}
                          </button>
                        </td>
                        <td>
                          <button className="linkBtn" type="button" onClick={() => openTask(t)}>
                            {t.title}
                          </button>
                        </td>
                        <td><span className="badge muted">{t.phase || "-"}</span></td>
                        <td><span className="badge danger">{t.days_late} dia(s)</span></td>
                        <td>{t.due_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                  <button className="btn small" type="button" onClick={() => goPainel({ view: "overdue" })}>Abrir no Painel</button>
                </div>
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 8 }}>Nenhuma tarefa atrasada.</div>
            )}
          </details>

          <details className="card compact" open={false}>
            <summary className="summaryRow">
              <span style={{ fontWeight: 750 }}>Imersões em risco</span>
              <span className="muted small">Sinais de execução</span>
            </summary>

            {riskImmersions.length > 0 ? (
              <div className="list" role="list">
                {riskImmersions.slice(0, 10).map((im) => (
                  <div className="immRow" key={im.immersion_id || im.id} role="listitem">
                    <div className="immMain">
                      <div className="immTitle">{im.immersion_name}</div>
                      <div className="immMeta">{im.signal || "Risco identificado"}</div>
                    </div>
                    <div className="immActions">
                      <button className="btn small" type="button" onClick={() => goPainel({ immersionId: im.immersion_id || im.id, view: "inbox" })}>
                        Abrir triagem
                      </button>
                      <button className="btn small ghost" type="button" onClick={() => goImmersion(im.immersion_id || im.id, encodeURIComponent(router.asPath))}>
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 8 }}>Nenhuma imersão em risco no momento.</div>
            )}
          </details>
        </div>
      </div>

      <style jsx>{`
        .dashWrap { max-width: 1280px; margin: 0 auto; }
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
