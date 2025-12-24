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
  const [search, setSearch] = useState("");

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
    const q = (search || "").trim().toLowerCase();
    const all = (items || []).filter((it) => {
      if (!q) return true;
      const hay = `${it.immersion_name || ""} ${it.status || ""} ${it.room_location || ""}`.toLowerCase();
      return hay.includes(q);
    });
    const byStatus = {};
    for (const it of all) {
      const k = it.status || "Planejamento";
      byStatus[k] = byStatus[k] || [];
      byStatus[k].push(it);
    }
    return byStatus;
  }, [items, search]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Imersões">
      <div className="container">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <div className="h2" style={{ margin: 0 }}>Imersões</div>
            <div className="small muted">Crie, acesse e acompanhe o andamento das imersões.</div>
          </div>
          {isFullAccess ? (
            <button className="btn primary" onClick={() => router.push("/imersoes/nova")}>Nova imersão</button>
          ) : null}
        </div>

        <div className="toolbar">
          <input
            className="input sm"
            style={{ maxWidth: 420 }}
            placeholder="Buscar por nome, status ou sala..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error ? <div className="alert danger" style={{ marginTop: 12 }}>{error}</div> : null}
        {loading ? <div className="skeletonList" /> : null}

        {!loading && (items || []).length === 0 ? (
          <div className="card">
            <p style={{ opacity: 0.85 }}>Nenhuma imersão cadastrada.</p>
            {isFullAccess ? <button className="btn" onClick={() => router.push("/imersoes/nova")}>Criar a primeira</button> : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {Object.keys(grouped).map((status) => (
            <div className="card" key={status}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{status}</h3>
                <span className={badgeClass(status)}>{(grouped[status] || []).length}</span>
              </div>

              <div style={{ marginTop: 8 }}>
                {(grouped[status] || []).map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="listItem"
                    onClick={() => router.push(`/imersoes/${it.id}`)}
                  >
                    <div className="listItemMain">
                      <div className="listItemTitle">{it.immersion_name || "(sem nome)"}</div>
                      <div className="listItemMeta">
                        {it.start_date} → {it.end_date} • D-{daysUntil(it.start_date)}
                      </div>
                    </div>
                    <div className="listItemAside">
                      <span className="pill">{it.room_location || "-"}</span>
                      <span className="chev">›</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
