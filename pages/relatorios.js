import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { getDashboardStats } from "../lib/dashboard";

function downloadCSV(filename, rows) {
  const escape = (v) => {
    if (v === null || typeof v === "undefined") return "";
    const s = String(v);
    if (s.includes("\"") || s.includes(",") || s.includes("\n")) return `"${s.replace(/\"/g, "\"\"")}"`;
    return s;
  };
  const csv = (rows || []).map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState({ overdueByImmersion: [], tasksByOwner: [], costByImmersion: [], riskImmersions: [], workload: [], productivity: [] });

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

        // 4) Visão executiva (risco + sobrecarga) reaproveitando a mesma heurística do Dashboard
        let riskImmersions = [];
        let workload = [];
        try {
          const dash = await getDashboardStats();
          riskImmersions = dash?.riskImmersions || [];
          workload = dash?.workload || [];
        } catch {
          // best-effort
        }

        // 5) Produtividade (PPT/Vídeos/Ferramentas) - view opcional
        let productivity = [];
        try {
          const { data: prod, error: eProd } = await supabase
            .from("immersion_productivity")
            .select("immersion_id, immersion_name, ppt_count, video_count, tool_count, material_count")
            .order("immersion_name", { ascending: true })
            .limit(5000);
          if (!eProd) productivity = prod || [];
        } catch {
          // best-effort
        }

        if (!mounted) return;
        setData({
          overdueByImmersion: Array.from(byImm.values()).sort((a, b) => b.overdue - a.overdue).slice(0, 30),
          tasksByOwner: Array.from(byOwner.values()).sort((a, b) => (b.open + b.done) - (a.open + a.done)).slice(0, 30),
          costByImmersion: Array.from(byCost.values()).sort((a, b) => b.total - a.total).slice(0, 30),
          riskImmersions,
          workload,
          productivity
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

  const hasAny = useMemo(
    () => (data.overdueByImmersion.length + data.tasksByOwner.length + data.costByImmersion.length + data.riskImmersions.length + data.workload.length + (data.productivity?.length || 0)) > 0,
    [data]
  );

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
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">Atrasos por imersão</div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadCSV(
                    "atrasos_por_imersao.csv",
                    [["Imersão", "Atrasadas"], ...data.overdueByImmersion.map((r) => [r.name, r.overdue])]
                  )}
                  disabled={!data.overdueByImmersion.length}
                >
                  Exportar CSV
                </button>
              </div>
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
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">Tarefas por dono</div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadCSV(
                    "tarefas_por_dono.csv",
                    [["Dono", "Abertas", "Concluídas"], ...data.tasksByOwner.map((r) => [r.owner, r.open, r.done])]
                  )}
                  disabled={!data.tasksByOwner.length}
                >
                  Exportar CSV
                </button>
              </div>
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
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">Custos por imersão</div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadCSV(
                    "custos_por_imersao.csv",
                    [["Imersão", "Total"], ...data.costByImmersion.map((r) => [r.name, r.total])]
                  )}
                  disabled={!data.costByImmersion.length}
                >
                  Exportar CSV
                </button>
              </div>
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
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">Imersões em risco</div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadCSV(
                    "imressoes_em_risco.csv",
                    [["Imersão", "Nível", "Score", "Motivos"], ...data.riskImmersions.map((r) => [r.immersion_name, r.level, r.score, (r.reasons || []).join("; ")])]
                  )}
                  disabled={!data.riskImmersions.length}
                >
                  Exportar CSV
                </button>
              </div>

              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Imersão</th>
                      <th>Nível</th>
                      <th>Score</th>
                      <th>Motivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.riskImmersions.map((r) => (
                      <tr key={r.immersion_id}>
                        <td><a href={`/imersoes/${r.immersion_id}`}>{r.immersion_name}</a></td>
                        <td><span className={`badge ${r.level === "Alto" ? "danger" : r.level === "Médio" ? "warn" : "muted"}`}>{r.level}</span></td>
                        <td>{r.score}</td>
                        <td className="small">{(r.reasons || []).join(" • ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="h2">Sobrecarga por responsável</div>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => downloadCSV(
                    "sobrecarga_por_responsavel.csv",
                    [["Responsável", "Abertas", "Atrasadas", "Vence em até 3 dias"], ...data.workload.map((w) => [w.responsible, w.open, w.overdue, w.dueSoon])]
                  )}
                  disabled={!data.workload.length}
                >
                  Exportar CSV
                </button>
              </div>
              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Responsável</th>
                      <th>Abertas</th>
                      <th>Atrasadas</th>
                      <th>Vence em 3d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workload.map((w) => (
                      <tr key={w.responsible_id}>
                        <td>{w.responsible}</td>
                        <td>{w.open}</td>
                        <td><span className={w.overdue > 0 ? "badge danger" : "badge muted"}>{w.overdue}</span></td>
                        <td><span className={w.dueSoon > 0 ? "badge warn" : "badge muted"}>{w.dueSoon}</span></td>
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
