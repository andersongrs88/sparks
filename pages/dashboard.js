import { useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { requireAuth } from "../lib/auth";
import { immersions } from "../lib/mock";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    requireAuth(router);
  }, [router]);

  const stats = useMemo(() => {
    const total = immersions.length;
    const late = immersions.reduce((acc, x) => acc + x.checklist.late, 0);
    const done = immersions.reduce((acc, x) => acc + x.checklist.done, 0);
    const tasks = immersions.reduce((acc, x) => acc + x.checklist.total, 0);
    return { total, late, done, tasks };
  }, []);

  return (
    <Layout title="Dashboard">
      <div className="row">
        <div className="col card">
          <div className="h2">Imersões</div>
          <div className="h1" style={{ margin: 0 }}>{stats.total}</div>
          <div className="small">Total cadastradas</div>
        </div>

        <div className="col card">
          <div className="h2">Checklist</div>
          <div className="h1" style={{ margin: 0 }}>{stats.done}/{stats.tasks}</div>
          <div className="small">Tarefas concluídas</div>
        </div>

        <div className="col card">
          <div className="h2">Atrasos</div>
          <div className="h1" style={{ margin: 0 }}>{stats.late}</div>
          <div className="small">Pendências atrasadas</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="card">
        <div className="h2">Próximas imersões</div>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Imersão</th>
              <th>Data</th>
              <th>Tipo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {immersions.map((x) => (
              <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/imersoes/${x.id}`)}>
                <td>{x.id}</td>
                <td>{x.name}</td>
                <td>{x.start} → {x.end}</td>
                <td>{x.type}</td>
                <td>{x.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
