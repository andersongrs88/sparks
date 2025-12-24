import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function daysLate(due) {
  if (!due) return 0;
  const today = new Date();
  const t = new Date(iso(today) + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  return Math.floor((t.getTime() - d.getTime()) / (24 * 3600 * 1000));
}

export default function PainelPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);

  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("Pendentes");
  const [immersionId, setImmersionId] = useState("all");
  const [immersionOptions, setImmersionOptions] = useState([]);

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
          .limit(300);
        if (e) throw e;
        if (!mounted) return;
        setImmersionOptions((data || []).map((r) => ({ id: r.id, name: r.immersion_name, start_date: r.start_date })));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  async function load() {
    try {
      setError("");
      setLoading(true);

      // bases antigas podem não ter evidence_link/evidence_path.
      const base = "id, immersion_id, title, phase, status, due_date, done_at, notes, immersions(immersion_name, status)";
      async function run(withEvidence) {
        const sel = withEvidence ? `${base}, evidence_link, evidence_path` : base;
        let q = supabase
          .from("immersion_tasks")
          .select(sel)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(500);
        if (immersionId !== "all") q = q.eq("immersion_id", immersionId);
        if (phase !== "all") q = q.eq("phase", phase);
        if (status === "Pendentes") q = q.neq("status", "Concluída");
        if (status === "Concluídas") q = q.eq("status", "Concluída");
        if (query.trim()) q = q.ilike("title", `%${query.trim()}%`);
        const { data, error: e } = await q;
        if (e) throw e;
        return data || [];
      }

      const today = iso(new Date());
      let rows = [];
      try {
        rows = await run(true);
      } catch (e) {
        const msg = String(e?.message || "");
        if ((msg.includes("evidence_link") || msg.includes("evidence_path")) && msg.includes("does not exist")) {
          rows = await run(false);
        } else {
          throw e;
        }
      }
      if (onlyOverdue) rows = rows.filter((t) => t.due_date && t.status !== "Concluída" && t.due_date < today);

      setTasks(rows);
    } catch (e) {
      setError(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, query, onlyOverdue, phase, status, immersionId]);

  const counts = useMemo(() => {
    const today = iso(new Date());
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Concluída").length;
    const overdue = tasks.filter((t) => t.due_date && t.status !== "Concluída" && t.due_date < today).length;
    return { total, done, overdue };
  }, [tasks]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Painel por Plano de Ação">
      <div className="container">
        <div className="card">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="h1" style={{ marginBottom: 6 }}>Painel por Plano de Ação</div>
              <div className="small muted">Acompanhe PA-PRÉ, DURANTE, PÓS e ações cadastradas manualmente.</div>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <div className="pill">Total: <b>{counts.total}</b></div>
              <div className="pill">Atrasadas: <b>{counts.overdue}</b></div>
              <div className="pill">Concluídas: <b>{counts.done}</b></div>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="input sm"
              style={{ maxWidth: 420 }}
              placeholder="Buscar por tarefa ou imersão..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className="toolbarGroup">
              <span className="toolbarLabel">Imersão</span>
              <select className="input sm" value={immersionId} onChange={(e) => setImmersionId(e.target.value)}>
                <option value="all">Todas</option>
                {(immersionOptions || []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>

            <div className="toolbarGroup">
              <span className="toolbarLabel">Fase</span>
              <select className="input sm" value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="all">Todas</option>
                <option value="PA-PRE">PA-PRÉ</option>
                <option value="DURANTE">DURANTE</option>
                <option value="POS">PÓS</option>
              </select>
            </div>

            <div className="toolbarGroup">
              <span className="toolbarLabel">Status</span>
              <select className="input sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Pendentes">Pendentes</option>
                <option value="Concluídas">Concluídas</option>
              </select>
            </div>

            <label className="row" style={{ gap: 8, marginLeft: 2 }}>
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
              <span className="small">Somente atrasadas</span>
            </label>
          </div>

          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          {loading ? <p>Carregando...</p> : null}

          {!loading && tasks.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>Nenhuma tarefa encontrada para os filtros selecionados.</p>
          ) : null}

          {!loading && tasks.length > 0 ? (
            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Imersão</th>
                    <th>Tarefa</th>
                    <th>Fase</th>
                    <th>Status</th>
                    <th>Atraso</th>
                    <th>Prazo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => {
                    const late = t.due_date && t.status !== "Concluída" && daysLate(t.due_date) > 0;
                    return (
                      <tr key={t.id}>
                        <td>
                          <a href={`/imersoes/${t.immersion_id}`} style={{ fontWeight: 800 }}>
                            {t.immersions?.name || "-"}
                          </a>
                          <div className="small muted">{t.immersions?.status || "-"}</div>
                        </td>
                        <td>{t.title}</td>
                        <td><span className="badge muted">{t.phase === "PA-PRE" ? "PA-PRÉ" : (t.phase || "-")}</span></td>
                        <td>
                          <span className={t.status === "Concluída" ? "badge success" : "badge muted"}>{t.status || "-"}</span>
                        </td>
                        <td>{late ? <span className="badge danger">{daysLate(t.due_date)} dia(s)</span> : <span className="badge muted">-</span>}</td>
                        <td>{t.due_date || "-"}</td>
                        <td>
                          <button className="btn sm" onClick={() => router.push(`/imersoes/${t.immersion_id}`)}>Abrir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
