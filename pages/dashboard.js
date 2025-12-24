import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { getDashboardStats } from "../lib/dashboard";
import { supabase } from "../lib/supabaseClient";
import { sortTasksByPriority } from "../lib/tasks";

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

        let query = supabase
          .from("immersion_tasks")
          .select("id, immersion_id, title, status, due_date, evidence_link, immersions(immersion_name)")
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

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Dashboard">
      <div className="container">
        <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div className="card">
            <div className="cardLabel">Imersões</div>
            <div className="cardValue">{stats.totalImmersions}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Tarefas</div>
            <div className="cardValue">{stats.totalTasks}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Atrasadas</div>
            <div className="cardValue">{stats.lateTasks}</div>
          </div>
          <div className="card">
            <div className="cardLabel">Concluídas</div>
            <div className="cardValue">{stats.doneTasks}</div>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Minhas tarefas</h3>
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
                <button className="btn" onClick={() => router.push("/painel")}>Abrir painel</button>
              </div>
            </div>

            {myError ? <p className="dangerText">{myError}</p> : null}
            {myLoading ? <p className="muted">Carregando...</p> : null}

            {!myLoading && (myTasks || []).length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>Nenhuma tarefa atribuída a você.</p>
            ) : null}

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {(myTasks || []).map((t) => (
                <div key={t.id} className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{t.title}</div>
                    <div className="small muted">
                      {t?.immersions?.name ? `Imersão: ${t.immersions.immersion_name} • ` : ""}
                      {t.due_date ? `Prazo: ${t.due_date}` : "Sem prazo"} • {t.status}
                    </div>
                  </div>
                  <button className="btn" onClick={() => router.push(`/imersoes/${t.immersion_id}`)}>Abrir</button>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>Próximas imersões</h3>
              <button className="btn" onClick={() => router.push("/imersoes")}>Ver todas</button>
            </div>

            {error ? <p className="dangerText">{error}</p> : null}
            {loading ? <p className="muted">Carregando...</p> : null}

            {!loading && (payload?.upcoming || []).length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>Nenhuma imersão cadastrada.</p>
            ) : null}

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {(payload?.upcoming || []).map((it) => (
                <div key={it.id} className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{it.immersion_name}</div>
                    <div className="small muted">{it.start_date} → {it.end_date} • {it.status}</div>
                  </div>
                  <div className="pill">{it.total_tasks || 0} tarefas</div>
                </div>
              ))}
            </div>
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
