import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
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
  const today = new Date();
  const diffMs = start - today;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

export default function ImmersionsListPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        const data = await listImmersions();
        if (!mounted) return;
        setItems(data || []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar imersões.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  const grouped = useMemo(() => {
    const all = items || [];
    const byStatus = {};
    for (const it of all) {
      const k = it.status || "Planejamento";
      byStatus[k] = byStatus[k] || [];
      byStatus[k].push(it);
    }
    return byStatus;
  }, [items]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Imersões">
      <div className="container">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Lista de imersões</h2>
          {isFullAccess ? (
            <button className="btn" onClick={() => router.push("/imersoes/nova")}>Nova imersão</button>
          ) : null}
        </div>

        {error ? <p style={{ color: "#ff6b6b" }}>{error}</p> : null}
        {loading ? <p>Carregando...</p> : null}

        {!loading && (items || []).length === 0 ? (
          <div className="card">
            <p style={{ opacity: 0.85 }}>Nenhuma imersão cadastrada.</p>
            {isFullAccess ? <button className="btn" onClick={() => router.push("/imersoes/nova")}>Criar a primeira</button> : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          {Object.keys(grouped).map((status) => (
            <div className="card" key={status}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{status}</h3>
                <span className={badgeClass(status)}>{(grouped[status] || []).length}</span>
              </div>

              <div style={{ marginTop: 8 }}>
                {(grouped[status] || []).map((it) => (
                  <div key={it.id} className="row" style={{ cursor: "pointer" }} onClick={() => router.push(`/imersoes/${it.id}`)}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{it.immersion_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        {it.start_date} → {it.end_date} • D-{daysUntil(it.start_date)}
                      </div>
                    </div>
                    <div className="pill">{it.room_location || "-"}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
