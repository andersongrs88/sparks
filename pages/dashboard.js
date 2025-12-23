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

const STATUS_OPTIONS = ["Todos", "Planejamento", "Em execução", "Concluída", "Cancelada"];

export default function DashboardPage() {
  
  useEffect(() => {
  const raw = typeof window !== "undefined" ? localStorage.getItem("sparks_user") : null;
  if (!raw) router.replace("/login");
}, [router]);

  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [immersions, setImmersions] = useState([]);
  const [lateTasks, setLateTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);

  // filtro de status
  const [statusFilter, setStatusFilter] = useState("Todos");

  // erros separados (não derruba o resto)
  const [errImm, setErrImm] = useState("");
  const [errTasks, setErrTasks] = useState("");
  const [errProfiles, setErrProfiles] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setErrImm("");
      setErrTasks("");
      setErrProfiles("");

      // 1) Imersões
      try {
        const im = await listImmersionsForDashboard();
        if (mounted) setImmersions(im);
      } catch (e) {
        if (mounted) setErrImm(e?.message || "Falha ao carregar imersões.");
      }

      // 2) Profiles
      try {
        const p = await listProfilesForDashboard();
        if (mounted) setProfiles(p);
      } catch (e) {
        if (mounted) setErrProfiles(e?.message || "Falha ao carregar usuários.");
      }

      // 3) Tasks
      try {
        const t = await listLateTasksForDashboard();
        if (mounted) setLateTasks(t);
      } catch (e) {
        if (mounted) setErrTasks(e?.message || "Falha ao carregar tarefas.");
      }

      if (mounted) setLoading(false);
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

  // Mapa imersões (para mostrar nome da imersão nas tarefas atrasadas)
  const immersionById = useMemo(() => {
    const map = new Map();
    for (const i of immersions) map.set(i.id, i);
    return map;
  }, [immersions]);

  const immersionsFiltered = useMemo(() => {
    if (statusFilter === "Todos") return immersions;
    return immersions.filter((i) => (i.status || "").trim() === statusFilter);
  }, [immersions, statusFilter]);

  const upcoming = useMemo(() => {
    const list = [...immersionsFiltered].filter((i) => i.start_date);
    list.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    return list.slice(0, 50); // com rolagem, podemos mostrar mais
  }, [immersionsFiltered]);

  const lateOnly = useMemo(() => {
    // tarefas atrasadas independem do filtro de status? aqui vamos respeitar o filtro:
    // se statusFilter != Todos, só mostra tarefas cuja imersão esteja nesse status.
    const late = (lateTasks || []).filter((t) => isLate(t.due_date, t.status));

    if (statusFilter === "Todos") return late.slice(0, 50);

    const filtered = late.filter((t) => {
      const im = t.immersion_id ? immersionById.get(t.immersion_id) : null;
      return im && (im.status || "").trim() === statusFilter;
    });

    return filtered.slice(0, 50);
  }, [lateTasks, statusFilter, immersionById]);

  const summary = useMemo(() => {
    const totalImm = immersionsFiltered.length;

    const emPlanejamento = immersionsFiltered.filter((i) => i.status === "Planejamento").length;
    const emExecucao = immersionsFiltered.filter((i) => i.status === "Em execução").length;
    const concluidas = immersionsFiltered.filter((i) => i.status === "Concluída").length;

    const totalLate = lateOnly.length;

    return { totalImm, emPlanejamento, emExecucao, concluidas, totalLate };
  }, [immersionsFiltered, lateOnly]);

  return (
    <Layout title="Dashboard">
      {/* Resumo */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="topbar" style={{ marginBottom: 10 }}>
          <div>
            <div className="h2">Resumo</div>
            <div className="small">Filtrando por status: <b>{statusFilter}</b></div>
          </div>

          <div style={{ minWidth: 220 }}>
            <div className="small" style={{ marginBottom: 6 }}>Filtro por status</div>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? <div className="small">Carregando...</div> : null}

        {errImm ? <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>Imersões: {errImm}</div> : null}
        {errTasks ? <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>Tarefas: {errTasks}</div> : null}
        {errProfiles ? <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>Usuários: {errProfiles}</div> : null}

        {!loading && !errImm ? (
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
              <div className="small">Rolagem habilitada (até 50)</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Painéis */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        {/* Próximas imersões */}
        <div className="col">
          <div className="card" style={{ maxHeight: 520, overflowY: "auto" }}>
            <div className="topbar" style={{ marginBottom: 10 }}>
              <div>
                <div className="h2">Próximas imersões</div>
                <div className="small">Ordenado por data de início (rolagem).</div>
              </div>
              <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
                Ver todas
              </button>
            </div>

            {!loading && upcoming.length === 0 ? <div className="small">Nenhuma imersão encontrada.</div> : null}

            {!loading && upcoming.length > 0 ? (
             <table className="table sticky">
                <thead>                  <tr>
<tr>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Imersão</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Início</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Dias</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Status</th>
</tr>
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

        {/* Tarefas atrasadas */}
        <div className="col">
          <div className="card" style={{ maxHeight: 520, overflowY: "auto" }}>
            <div className="topbar" style={{ marginBottom: 10 }}>
              <div>
                <div className="h2">Tarefas atrasadas</div>
                <div className="small">Até 50 tarefas com prazo vencido e não concluídas (rolagem).</div>
              </div>
            </div>

            {!loading && lateOnly.length === 0 ? <div className="small">Nenhuma tarefa atrasada. Ótimo.</div> : null}

            {!loading && lateOnly.length > 0 ? (
<table className="table sticky">
<thead>                  <tr>
<tr>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Tarefa</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Prazo</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Responsável</th>
  <th style={{ position: "sticky", top: 0, background: "#0b1220", zIndex: 3 }}>Imersão</th>
</tr>

                  </tr>
                </thead>
                <tbody>
                  {lateOnly.map((t) => {
                    const prof = t.owner_profile_id ? profileById.get(t.owner_profile_id) : null;
                    const im = t.immersion_id ? immersionById.get(t.immersion_id) : null;

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





