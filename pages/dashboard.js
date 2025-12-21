import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { listImmersionsForDashboard, listLateTasksForDashboard, listProfilesForDashboard } from "../lib/dashboard";

function toLocalDateOnly(d) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(startDateValue) {
  if (!startDateValue) return null;

  const start = toLocalDateOnly(startDateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = start.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getCountdownSignal(days) {
  if (days === null) return null;

  if (days <= 0) return { label: `${days}d`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
  if (days >= 60) return { label: `${days}d`, style: { background: "#0d3b1e", borderColor: "#1b6b36" } };
  if (days >= 40) return { label: `${days}d`, style: { background: "#0b2b52", borderColor: "#1f4f99" } };
  if (days >= 30) return { label: `${days}d`, style: { background: "#071a35", borderColor: "#163a7a" } };
  if (days >= 20) return { label: `${days}d`, style: { background: "#4a2a00", borderColor: "#b86b00" } };
  if (days >= 10) return { label: `${days}d`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
  return { label: `${days}d`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
}

function isLate(dueDateStr, status) {
  if (!dueDateStr) return false;
  if (status === "Concluída") return false;
  const due = toLocalDateOnly(dueDateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [immersions, setImmersions] = useState([]);
  const [lateTasks, setLateTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [im, t, p] = await Promise.all([
          listImmersionsForDashboard(),
          listLateTasksForDashboard(),
          listProfilesForDashboard()
        ]);

        if (!mounted) return;

        setImmersions(im);
        setLateTasks(t);
        setProfiles(p);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar o dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const profileById = useMemo(() => {
    const map = new Map();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const upcoming = useMemo(() => {
    // Mostra apenas as próximas 10 por data
    const list = [...immersions].filter((i) => i.start_date);
    list.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    return list.slice(0, 10);
  }, [immersions]);

  const lateOnly = useMemo(() => {
    return (lateTasks || [])
      .filter((t) => isLate(t.due_date, t.status))
      .slice(0, 20);
  }, [lateTasks]);

  const summary = useMemo(() => {
    const totalImm = immersions.length;
    const emPlanejamento = immersions.filter((i) => i.status === "Planejamento").length;
    const emExecucao = immersions.filter((i) => i.status === "Em execução").length;
    const concluidas = immersions.filter((i) => i.status === "Concluída").length;

    const totalLate = lateOnly.length;

    return { totalImm, emPlanejamento, emExecucao, concluidas, totalLate };
  }, [immersions, lateOnly]);

  return (
    <Layout title="Dashboard">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h2">Resumo</div>

        {loading ? <div className="small">Carregando...</div> : null}
        {error ? <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div> : null}

        {!loading && !error ? (
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <div className="card" style={{ minWidth: 220 }}>
              <div className="small">Imersões</div>
              <div className="h1" style={{ margin: 0 }}>{summary.totalImm}</div>
              <div className="small">Planejamento: {summary.emPlanejamento}</div>
              <div className="small">Em execução: {summary.emExecucao}</div>
              <div className="small">Concluídas: {summary.concluidas}</div>
            </div>

            <div className="card" style={{ minWidth: 220 }}>
              <div className="small">Tarefas atrasadas</div>
              <div className="h1" style={{ margin: 0 }}>{summary.totalLate}</div>
              <div className="small">Exibindo até 20 no painel abaixo</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="col">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="topbar" style={{ marginBottom: 10 }}>
              <div>
                <div className="h2">Próximas imersões</div>
                <div className="small">Ordenado por data de início (até 10).</div>
              </div>
              <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
                Ver todas
              </button>
            </div>

            {!loading && upcoming.length === 0 ? <div className="small">Nenhuma imersão encontrada.</div> : null}

            {!loading && upcoming.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Imersão</th>
                    <th>Início</th>
                    <th>Dias</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((i) => {
                    const d = daysUntil(i.start_date);
                    const signal = getCountdownSignal(d);

                    return (
                      <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/imersoes/${i.id}`)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{i.immersion_name || "-"}</div>
                          <div className="small">Sala: {i.room_location || "-"}</div>
                        </td>
                        <td>{i.start_date || "-"}</td>
                        <td>
                          {signal ? (
                            <span
                              className="badge"
                              style={{
                                ...signal.style,
                                border: "1px solid",
                                padding: "6px 10px",
                                borderRadius: 999
                              }}
                            >
                              {signal.label}
                            </span>
                          ) : "-"}
                        </td>
                        <td>{i.status || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>

        <div className="col">
          <div className="card">
            <div className="topbar" style={{ marginBottom: 10 }}>
              <div>
                <div className="h2">Tarefas atrasadas</div>
                <div className="small">Apenas tarefas com prazo no passado e não concluídas (até 20).</div>
              </div>
            </div>

            {!loading && lateOnly.length === 0 ? <div className="small">Nenhuma tarefa atrasada. Ótimo.</div> : null}

            {!loading && lateOnly.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarefa</th>
                    <th>Prazo</th>
                    <th>Responsável</th>
                    <th>Imersão</th>
                  </tr>
                </thead>
                <tbody>
                  {lateOnly.map((t) => {
                    const prof = t.owner_profile_id ? profileById.get(t.owner_profile_id) : null;
                    const im = t.immersions;

                    return (
                      <tr key={t.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{t.title}</div>
                          <div className="small">{t.phase}</div>
                        </td>
                        <td>{t.due_date || "-"}</td>
                        <td>{prof ? `${prof.name} (${prof.role})` : "-"}</td>
                        <td>
                          {im?.id ? (
                            <button className="btn" type="button" onClick={() => router.push(`/imersoes/${im.id}`)}>
                              {im.immersion_name || "Abrir"}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}
