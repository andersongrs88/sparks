import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { getDashboardStats } from "../lib/dashboard";
import { supabase } from "../lib/supabaseClient";
import { sortTasksByPriority, syncOverdueTasksGlobal, isTaskDone } from "../lib/tasks";

export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ stats: null, upcoming: [], overdue: [] });

  const [myTasks, setMyTasks] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState("");
  const [immersionFilter, setImmersionFilter] = useState("all");
  const [immersionOptions, setImmersionOptions] = useState([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    (async () => {
      try {
        setError("");
        setLoading(true);
        // Governança: sincroniza atrasos (best-effort)
        try { await syncOverdueTasksGlobal(); } catch {}
        const data = await getDashboardStats();
        if (!mounted) return;
        setPayload(data);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar dados.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("immersions")
          .select("id, immersion_name, start_date")
          .order("start_date", { ascending: false })
          .limit(300);
        if (err) throw err;
        if (!mounted) return;
        setImmersionOptions(data ?? []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    async function loadMy() {
      try {
        setMyError("");
        setMyLoading(true);

        // Best-effort: mantém status "Atrasada" atualizado.
        try { await syncOverdueTasksGlobal(); } catch {}

        // Keep the select list aligned with the actual database schema.
        // Some deployments may not have an evidence_link column, so we avoid selecting it here.
        let query = supabase
          .from("immersion_tasks")
          .select("id, immersion_id, title, status, due_date, immersions(immersion_name)")
          .eq("responsible_id", user.id)
          .neq("status", "Concluída");

        if (immersionFilter !== "all") query = query.eq("immersion_id", immersionFilter);

        const { data, error: qErr } = await query
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(20);

        if (qErr) throw qErr;
        if (!mounted) return;
        setMyTasks(sortTasksByPriority(data ?? []));
      } catch (e) {
        if (!mounted) return;
        setMyError(e?.message || "Falha ao carregar tarefas.");
      } finally {
        if (mounted) setMyLoading(false);
      }
    }

    loadMy();
    return () => { mounted = false; };
  }, [authLoading, user, immersionFilter]);

  const stats = useMemo(() => {
    const s = payload?.stats;
    return {
      totalImmersions: s?.totalImmersions ?? 0,
      totalTasks: s?.totalTasks ?? 0,
      lateTasks: s?.lateTasks ?? 0,
      doneTasks: s?.doneTasks ?? 0
    };
  }, [payload]);

  const riskImmersions = payload?.riskImmersions ?? [];
  const workload = payload?.workload ?? [];

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Dashboard">
      <div className="container">
        <section className="kpiSection" aria-label="Indicadores">
          <div className="kpiGrid">
            <div className="kpiCard">
              <div className="kpiLabel">Imersões</div>
              <div className="kpiValue">{stats.totalImmersions}</div>
              <div className="kpiMeta">Cadastradas no sistema</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Tarefas</div>
              <div className="kpiValue">{stats.totalTasks}</div>
              <div className="kpiMeta">Total registradas</div>
            </div>
            <div className="kpiCard danger">
              <div className="kpiLabel">Atrasadas</div>
              <div className="kpiValue">{stats.lateTasks}</div>
              <div className="kpiMeta">Prioridade máxima</div>
            </div>
            <div className="kpiCard success">
              <div className="kpiLabel">Concluídas</div>
              <div className="kpiValue">{stats.doneTasks}</div>
              <div className="kpiMeta">Entregas finalizadas</div>
            </div>
          </div>
        </section>

        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Minhas tarefas</h3>
                <div className="small muted">Entregas pendentes atribuídas a você</div>
              </div>
              <div className="row wrap" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="small muted">Imersão</span>
                  <select className="input" value={immersionFilter} onChange={(e) => setImmersionFilter(e.target.value)}>
                    <option value="all">Todas</option>
                    {(immersionOptions || []).map((im) => (
                      <option key={im.id} value={im.id}>{im.immersion_name}</option>
                    ))}
                  </select>
                </div>
                <button className="btn" onClick={() => router.push("/painel")}>Abrir plano de ação</button>
              </div>
            </div>

            {myError ? (
              <div className="alert danger" role="status">
                Não foi possível carregar suas tarefas. Tente novamente.
              </div>
            ) : null}
            {myLoading ? <div className="skeletonList" aria-label="Carregando tarefas" /> : null}

            {!myLoading && (myTasks || []).length === 0 ? (
              <div className="emptyState" style={{ marginTop: 12 }}>
                <div className="emptyTitle">Nenhuma tarefa pendente</div>
                <div className="small muted">Você está em dia. Selecione outra imersão para filtrar ou acesse o plano de ação.</div>
              </div>
            ) : null}

            <div className="list" style={{ marginTop: 12 }}>
              {(myTasks || []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="listItem"
                  onClick={() => router.push(`/imersoes/${t.immersion_id}`)}
                >
                  <div className="listItemMain">
                    <div className="listItemTitle">{t.title}</div>
                    <div className="listItemMeta">
                      {t?.immersions?.immersion_name ? `Imersão: ${t.immersions.immersion_name} • ` : ""}
                      {t.due_date ? `Prazo: ${t.due_date}` : "Sem prazo"}
                    </div>
                  </div>
                  <div className="listItemAside">
                    <span className={t.due_date ? "badge" : "badge muted"}>{t.status}</span>
                    <span className="chev" aria-hidden="true">›</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Próximas imersões</h3>
                <div className="small muted">Planejamento e status operacional</div>
              </div>
              <button className="btn" onClick={() => router.push("/imersoes")}>Ver todas</button>
            </div>

            {error ? (
              <div className="alert danger" role="status">
                Não foi possível carregar as imersões. Tente novamente.
              </div>
            ) : null}
            {loading ? <div className="skeletonList" aria-label="Carregando imersões" /> : null}

            {!loading && (payload?.upcoming || []).length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>Nenhuma imersão cadastrada.</p>
            ) : null}

            <div className="cardsList" style={{ marginTop: 12 }}>
              {(payload?.upcoming || []).map((it) => (
                <div key={it.id} className="miniCard" role="group" aria-label={it.immersion_name}>
                  <div className="miniCardMain">
                    <div className="miniCardTitle">{it.immersion_name}</div>
                    <div className="miniCardMeta">
                      {it.start_date} → {it.end_date} • {it.status}
                      {it.next_action?.title ? ` • Próxima ação: ${it.next_action.title}${it.next_action.due_date ? ` (prazo ${it.next_action.due_date})` : ""}` : ""}
                    </div>
                  </div>
                  <div className="miniCardAside">
                    <span className="pill">{it.total_tasks || 0} tarefas</span>
                    <button className="btn" onClick={() => router.push(`/imersoes/${it.id}`)}>Abrir</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Prioridade de leitura: sinais de execução primeiro, detalhes de atrasos por último. */}
        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Imersões em risco</h3>
                <div className="small muted">Sinalização automática por atrasos, prazos próximos e tarefas sem dono</div>
              </div>
              <button className="btn" onClick={() => router.push("/relatorios")}>Ver relatórios</button>
            </div>

            {!loading && riskImmersions.length === 0 ? (
              <div className="emptyState" style={{ marginTop: 12 }}>
                <div className="emptyTitle">Nenhum risco relevante</div>
                <div className="small muted">No momento, as imersões estão em controle operacional.</div>
              </div>
            ) : null}

            {riskImmersions.length > 0 ? (
              <div className="list" style={{ marginTop: 12 }}>
                {riskImmersions.map((r) => (
                  <button key={r.immersion_id} className="listItem" type="button" onClick={() => router.push(`/imersoes/${r.immersion_id}`)}>
                    <div className="listItemMain">
                      <div className="listItemTitle">{r.immersion_name}</div>
                      <div className="listItemMeta">
                        {r.start_date ? `Início: ${r.start_date} • ` : ""}
                        {r.status ? `Status: ${r.status}` : ""}
                        {r.reasons?.length ? ` • Motivos: ${r.reasons.join(", ")}` : ""}
                      </div>
                      {r.reasons?.length ? (
                        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                          {r.reasons.slice(0, 4).map((tx, idx) => (
                            <span key={idx} className="pill">{tx}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="listItemAside">
                      <span className={r.level === "Alto" ? "badge danger" : r.level === "Médio" ? "badge" : "badge muted"}>{r.level}</span>
                      <span className="chev" aria-hidden="true">›</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="sectionHeader">
              <div>
                <h3 className="sectionTitle">Sobrecarga por responsável</h3>
                <div className="small muted">Abertas, atrasadas e vencendo em até 3 dias</div>
              </div>
              <button className="btn" onClick={() => router.push("/usuarios")}>Gerenciar usuários</button>
            </div>

            {!loading && workload.length === 0 ? (
              <div className="emptyState" style={{ marginTop: 12 }}>
                <div className="emptyTitle">Sem dados de responsáveis</div>
                <div className="small muted">Defina o responsável nas tarefas para ativar esta visão.</div>
              </div>
            ) : null}

            {workload.length > 0 ? (
              <div className="tableWrap" style={{ marginTop: 10 }}>
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
                      <tr key={w.responsible_id}>
                        <td>
                          <div style={{ fontWeight: 850 }}>{w.responsible}</div>
                          {w.reasons?.length ? (
                            <div className="small muted" style={{ marginTop: 4 }}>
                              Motivo: {w.reasons.join(", ")}
                            </div>
                          ) : (
                            <div className="small muted" style={{ marginTop: 4 }}>Carga operacional normal</div>
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
            ) : null}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Tarefas atrasadas</h3>
            <button className="btn" onClick={() => router.push("/painel")}>Abrir painel</button>
          </div>

          {!loading && (payload?.overdue || []).length === 0 ? (
            <p className="muted" style={{ marginTop: 10 }}>Nenhuma tarefa atrasada no momento.</p>
          ) : null}

          {!loading && (payload?.overdue || []).length > 0 ? (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
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
                  {(payload?.overdue || []).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <a href={`/imersoes/${t.immersion_id}`} style={{ fontWeight: 700 }}>{t.immersion_name}</a>
                        <div className="small muted">{t.immersion_status}</div>
                      </td>
                      <td>{t.title}</td>
                      <td><span className="badge muted">{t.phase || "-"}</span></td>
                      <td><span className="badge danger">{t.days_late} dia(s)</span></td>
                      <td>{t.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
