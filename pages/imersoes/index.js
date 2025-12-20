import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { listImmersions } from "../../lib/immersions";

function badgeClass(status) {
  if (status === "Concluída") return "badge ok";
  if (status === "Em execução") return "badge warn";
  if (status === "Cancelada") return "badge danger";
  return "badge";
}

function daysUntil(startDateStr) {
  if (!startDateStr) return "-";
  const start = new Date(startDateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = start.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

export default function ImmersionsListPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await listImmersions();
        if (mounted) setItems(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  const rows = useMemo(() => items, [items]);

  return (
    <Layout title="Imersões">
      <div className="card">
        <div className="topbar" style={{ marginBottom: 10 }}>
          <div>
            <div className="h2">Lista</div>
            <div className="small">Cadastros reais no Supabase</div>
          </div>
          <button className="btn primary" onClick={() => router.push("/imersoes/nova")}>
            Nova imersão
          </button>
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}
        {loading ? <div className="small">Carregando...</div> : null}

        {!loading && rows.length === 0 ? (
          <div className="small">Nenhuma imersão cadastrada ainda. Clique em “Nova imersão”.</div>
        ) : null}

        {!loading && rows.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Imersão</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Dias até</th>
                <th>Sala/Local</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr
                  key={x.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/imersoes/${x.id}`)}
                >
                  <td>{x.immersion_name}</td>
                  <td>{x.start_date}</td>
                  <td>{x.end_date}</td>
                  <td>
                    <span className="badge">
                      {daysUntil(x.start_date)}
                    </span>
                  </td>
                  <td>{x.room_location || "-"}</td>
                  <td><span className={badgeClass(x.status)}>{x.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="small" style={{ marginTop: 12 }}>
          Próximo passo: tela de detalhe/edição com todos os campos do seu cadastro.
        </div>
      </div>
    </Layout>
  );
}
