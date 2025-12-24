import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { getDashboardStats } from "../lib/dashboard";
import { supabase } from "../lib/supabaseClient";
import { sortTasksByPriority } from "../lib/tasks";
import { AREAS, roleLabel } from "../lib/permissions";

export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, user, role, isFullAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState({ stats: null, upcoming: [] });

  const [myTasks, setMyTasks] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myError, setMyError] = useState("");
  const [areaFilter, setAreaFilter] = useState("eventos");
  const [immersionFilter, setImmersionFilter] = useState("all");
  const [immersionOptions, setImmersionOptions] = useState([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;

    let mounted = true;

    async function load() {
      try {
        setError("");
        setLoading(true);
        const data = await getDashboardStats();
        if (!mounted) return;
        setPayload(data);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar dados.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  // Carrega opções de imersão para filtro
  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("immersions")
          .select("id, name, start_date")
          .order("start_date", { ascending: false })
          .limit(300);
        if (err) throw err;
        if (!mounted) return;
        setImmersionOptions(data ?? []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    async function loadMy() {
      try {
        setMyError("");
        setMyLoading(true);

        // Full access: filtra por área escolhida.
        // Área: mostra somente tarefas da própria área.
        if (!isFullAccess && !AREAS.includes(role)) {
          if (mounted) setMyTasks([]);
          return;
        }

        const areaToUse = isFullAccess ? areaFilter : role;
        let query = supabase
          .from("immersion_tasks")
          .select("id, immersion_id, title, area, status, due_date, evidence_link")
          .eq("area", areaToUse)
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
    return () => {
      mounted = false;
    };
  }, [authLoading, user, role, isFullAccess, areaFilter, immersionFilter]);

  const stats = useMemo(() => {
    const s = payload?.stats;
    return {
      total: s?.totalImmersions ?? 0,
      late: s?.lateTasks ?? 0,
      done: s?.doneTasks ?? 0,
      tasks: s?.totalTasks ?? 0
    };
  }, [payload]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Dashboard">
      <div className="container">
        <div className="grid">
          <div className="card">
            <div className="cardLabel">Imersões</div>
            <div className="cardValue">{stats.total}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Tarefas</div>
            <div className="cardValue">{stats.tasks}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Atrasadas</div>
            <div className="cardValue">{stats.late}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Concluídas</div>
            <div className="cardValue">{stats.done}</div>
          </div>
        </div>

        {(isFullAccess || AREAS.includes(role)) ? (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Minhas tarefas</h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {isFullAccess ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>Área</span>
                    <select className="input" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                      {AREAS.map((a) => (
                        <option key={a} value={a}>{roleLabel(a)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>Área: {roleLabel(role)}</div>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>Imersão</span>
                  <select className="input" value={immersionFilter} onChange={(e) => setImmersionFilter(e.target.value)}>
                    <option value="all">Todas</option>
                    {(immersionOptions || []).map((im) => (
                      <option key={im.id} value={im.id}>{im.name}</option>
                    ))}
                  </select>
                </div>

                <button className="btn" onClick={() => router.push("/painel")}>Abrir painel</button>
              </div>
            </div>

            {myError ? <p style={{ color: "#ff6b6b" }}>{myError}</p> : null}
            {myLoading ? <p>Carregando...</p> : null}

            {!myLoading && (myTasks || []).length === 0 ? (
              <p style={{ opacity: 0.8 }}>Nenhuma tarefa pendente para esta área.</p>
            ) : null}

            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {(myTasks || []).map((t) => (
                <div
                  key={t.id}
                  className="row"
                  onClick={() => router.push(`/imersoes/${t.immersion_id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.title}</div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>
                      {t.due_date ? `Prazo: ${t.due_date}` : "Sem prazo"} • {t.status} • Área: {t.area || "-"}
                    </div>
                  </div>
                  <div className="pill">Abrir</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Próximas imersões</h3>
            <button className="btn" onClick={() => router.push("/imersoes")}>Ver todas</button>
          </div>

          {error ? <p style={{ color: "#ff6b6b" }}>{error}</p> : null}
          {loading ? <p>Carregando...</p> : null}

          {!loading && (payload?.upcoming || []).length === 0 ? (
            <p style={{ opacity: 0.8 }}>Nenhuma imersão cadastrada.</p>
          ) : null}

          <div style={{ marginTop: 8 }}>
            {(payload?.upcoming || []).map((it) => (
              <div
                key={it.id}
                className="row"
                onClick={() => router.push(`/imersoes/${it.id}`)}
                style={{ cursor: "pointer" }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{it.immersion_name}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {it.start_date} → {it.end_date} • {it.status}
                  </div>
                </div>
                <div className="pill">{it.total_tasks || 0} tarefas</div>
              </div>
            ))}
          </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Tarefas atrasadas</h3>
            <button className="btn" onClick={() => router.push("/painel")}>Abrir painel</button>
          </div>

          {!loading && (payload?.overdue || []).length === 0 ? (
            <p style={{ opacity: 0.8, marginTop: 8 }}>Nenhuma tarefa atrasada no momento.</p>
          ) : null}

          {!loading && (payload?.overdue || []).length > 0 ? (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Imersão</th>
                    <th>Tarefa</th>
                    <th>Fase</th>
                    <th>Área</th>
                    <th>Atraso</th>
                    <th>Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.overdue || []).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <a href={`/imersoes/${t.immersion_id}`} style={{ fontWeight: 600 }}>
                          {t.immersion_name}
                        </a>
                        <div className="small">{t.immersion_status}</div>
                      </td>
                      <td>{t.title}</td>
                      <td><span className="badge muted">{t.phase || "-"}</span></td>
                      <td><span className="badge muted">{t.area || "-"}</span></td>
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
      </div>
    </Layout>
  );
}
