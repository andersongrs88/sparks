import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { requireAuth } from "../../lib/auth";
import { immersions } from "../../lib/mock";

function badgeClass(status) {
  if (status === "Concluída") return "badge ok";
  if (status === "Em execução") return "badge warn";
  if (status === "Planejamento") return "badge";
  return "badge";
}

export default function ImmersionsListPage() {
  const router = useRouter();

  useEffect(() => {
    requireAuth(router);
  }, [router]);

  return (
    <Layout title="Imersões">
      <div className="card">
        <div className="h2">Lista</div>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Imersão</th>
              <th>Local</th>
              <th>Datas</th>
              <th>Status</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {immersions.map((x) => (
              <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/imersoes/${x.id}`)}>
                <td>{x.id}</td>
                <td>{x.name}</td>
                <td>{x.location}</td>
                <td>{x.start} → {x.end}</td>
                <td><span className={badgeClass(x.status)}>{x.status}</span></td>
                <td>
                  <span className="small">
                    {x.checklist.done}/{x.checklist.total} concluídas • {x.checklist.late} atrasadas
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="small" style={{ marginTop: 12 }}>
          Próximo passo: botão “Criar imersão” e edição real (vamos fazer em seguida).
        </div>
      </div>
    </Layout>
  );
}
