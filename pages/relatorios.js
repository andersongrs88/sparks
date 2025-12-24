import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";

function iso(d) {
  return d.toISOString().slice(0, 10);
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ overdueByImmersion: [], tasksByOwner: [], costByImmersion: [] });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError("");
        setLoading(true);

        // 1) Atrasos por imersão
        // Importante: bases antigas podem não ter responsible_id ainda.
        // Tentamos com responsible_id e degradamos caso a coluna não exista.
        const baseSelect = "id, immersion_id, status, due_date, immersions(immersion_name)";
        async function fetchTasks(withOwner) {
          const { data, error } = await supabase
            .from("immersion_tasks")
            .select(withOwner ? `${baseSelect}, responsible_id` : baseSelect)
            .neq("status", "Concluída")
            .not("due_date", "is", null)
            .limit(5000);
          if (error) throw error;
          return data ?? [];
        }

        let taskRows = [];
        try {
          taskRows = await fetchTasks(true);
        } catch (e) {
          const msg = String(e?.message || "");
          if (msg.includes("responsible_id") && msg.includes("does not exist")) {
            taskRows = await fetchTasks(false);
          } else {
            throw e;
          }
        }

        const today = new Date(iso(new Date()) + "T00:00:00");
        const overdue = (taskRows || []).filter((t) => new Date(t.due_date + "T00:00:00") < today);

        const byImm = new Map();
        for (const t of overdue) {
          const key = t.immersion_id;
          const prev = byImm.get(key) || { immersion_id: key, name: t.immersions?.immersion_name || "-", overdue: 0 };
          prev.overdue += 1;
          byImm.set(key, prev);
        }

        // 2) Tarefas por dono
        const { data: profiles, error: e2 } = await supabase.from("profiles").select("id, name").limit(5000);
        if (e2) throw e2;
        const profMap = new Map((profiles || []).map((p) => [p.id, p.name]));
        const byOwner = new Map();
        for (const t of taskRows || []) {
          const key = t.responsible_id || "-";
          const prev = byOwner.get(key) || { owner_id: key, owner: profMap.get(key) || "Sem dono", open: 0, done: 0 };
          if (t.status === "Concluída") prev.done += 1;
          else prev.open += 1;
          byOwner.set(key, prev);
        }

        // 3) Custos por imersão (total)
        const { data: costRows, error: e3 } = await supabase
          .from("immersion_costs")
          .select("immersion_id, value, immersions(immersion_name)")
          .limit(10000);
        if (e3) throw e3;
        const byCost = new Map();
        for (const c of costRows || []) {
          const key = c.immersion_id;
          const prev = byCost.get(key) || { immersion_id: key, name: c.immersions?.immersion_name || "-", total: 0 };
          prev.total += Number(c.value || 0);
          byCost.set(key, prev);
        }

        if (!mounted) return;
        setData({
          overdueByImmersion: Array.from(byImm.values()).sort((a, b) => b.overdue - a.overdue).slice(0, 30),
          tasksByOwner: Array.from(byOwner.values()).sort((a, b) => (b.open + b.done) - (a.open + a.done)).slice(0, 30),
          costByImmersion: Array.from(byCost.values()).sort((a, b) => b.total - a.total).slice(0, 30)
        });
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar relatórios.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const hasAny = useMemo(() => (data.overdueByImmersion.length + data.tasksByOwner.length + data.costByImmersion.length) > 0, [data]);

  return (
    <Layout title="Relatórios">
      <div className="container" style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div className="h2">Visão executiva</div>
          <div className="small muted">Relatórios rápidos para acompanhamento do Plano de Ação e custos.</div>
        </div>

        {error ? <div className="card"><div className="small" style={{ color: "var(--danger)" }}>{error}</div></div> : null}
        {loading ? <div className="card"><div className="small">Carregando...</div></div> : null}
        {!loading && !hasAny ? <div className="card"><div className="small muted">Sem dados suficientes para relatórios.</div></div> : null}

        {!loading ? (
          <div className="grid2">
            <div className="card">
              <div className="h2">Atrasos por imersão</div>
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                <thead><tr><th>Imersão</th><th>Atrasadas</th></tr></thead>
                <tbody>
                  {data.overdueByImmersion.map((r) => (
                    <tr key={r.immersion_id}>
                        <td><a href={`/imersoes/${r.immersion_id}`}>{r.name}</a></td>
                      <td><span className="badge danger">{r.overdue}</span></td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="h2">Tarefas por dono</div>
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                <thead><tr><th>Dono</th><th>Abertas</th><th>Concluídas</th></tr></thead>
                <tbody>
                  {data.tasksByOwner.map((r) => (
                    <tr key={r.owner_id}>
                      <td>{r.owner}</td>
                      <td>{r.open}</td>
                      <td>{r.done}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="h2">Custos por imersão</div>
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                <thead><tr><th>Imersão</th><th>Total</th></tr></thead>
                <tbody>
                  {data.costByImmersion.map((r) => (
                    <tr key={r.immersion_id}>
                        <td><a href={`/imersoes/${r.immersion_id}`}>{r.name}</a></td>
                      <td>{r.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="h2">Exportações</div>
              <div className="small muted" style={{ marginTop: 6 }}>
                Sugestões: exportar Plano de Ação (CSV), custos (CSV) e lista de atrasadas.
              </div>
              <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn sm" href="/painel">Abrir Plano de Ação</a>
                <a className="btn sm" href="/imersoes">Abrir Imersões</a>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
