import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { listImmersions } from "../../lib/immersions";
import { listProfiles } from "../../lib/profiles";

function normalizeStatus(status) {
  // Back-compat: o sistema antigo usava "Em execução".
  if (status === "Em execução") return "Em andamento";
  return status || "Planejamento";
}

function badgeClass(status) {
  const s = normalizeStatus(status);
  if (s === "Concluída") return "badge ok";
  if (s === "Em andamento") return "badge warn";
  if (s === "Confirmada") return "badge info";
  if (s === "Cancelada") return "badge danger";
  return "badge";
}

function toDateOnly(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr + "T00:00:00");
  // Normalize to local date-only
  d.setHours(0, 0, 0, 0);
  return d;
}

function scheduleTag(startDateStr, endDateStr) {
  const start = toDateOnly(startDateStr);
  const end = toDateOnly(endDateStr);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If we have an end date and it's in the past, it's finished
  if (end && today > end) return { label: "Encerrada", cls: "tag neutral" };

  // If we have a start date and we're between start and end (or end is missing), it's ongoing
  if (start && today >= start && (!end || today <= end)) return { label: "Em andamento", cls: "tag info" };

  // If it hasn't started yet, show countdown
  if (start && today < start) {
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.ceil((start.getTime() - today.getTime()) / msPerDay);

    if (days === 0) return { label: "Começa hoje", cls: "tag danger" };
    if (days === 1) return { label: "Falta 1 dia", cls: "tag danger" };
    if (days <= 7) return { label: `Faltam ${days}d`, cls: "tag danger" };
    if (days <= 20) return { label: `Faltam ${days}d`, cls: "tag warn" };
    if (days <= 59) return { label: `Faltam ${days}d`, cls: "tag info" };
    return { label: `Faltam ${days}d`, cls: "tag ok" };
  }

  return { label: "Sem data", cls: "tag neutral" };
}


export default function ImmersionsListPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [items, setItems] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedConcluded, setCollapsedConcluded] = useState(true);
  const [collapsedCanceled, setCollapsedCanceled] = useState(true);

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
        const [data, profs] = await Promise.all([
          listImmersions(),
          // Perfis: usado apenas para exibir nomes (Consultor/Designer) na listagem.
          // Mantém o UX mais confiável sem exigir abrir cada imersão.
          listProfiles().catch(() => []),
        ]);
        if (!mounted) return;
        setItems(data || []);

        const map = {};
        for (const p of profs || []) {
          if (!p?.id) continue;
          const name = p.name ? String(p.name).trim() : "";
          const email = p.email ? String(p.email).trim() : "";
          map[p.id] = name ? name : (email || "-");
        }
        setProfilesById(map);
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
      const k = normalizeStatus(it.status);
      byStatus[k] = byStatus[k] || [];
      byStatus[k].push(it);
    }
    return byStatus;
  }, [items, search]);

  const statusOrder = useMemo(() => {
    // Ordem operacional (foco em execução) + seções históricas colapsáveis.
    const ordered = ["Em andamento", "Planejamento", "Confirmada", "Concluída", "Cancelada"];
    const other = Object.keys(grouped || {}).filter((k) => !ordered.includes(k));
    return [...ordered, ...other];
  }, [grouped]);

  function displayNameById(id) {
    if (!id) return "-";
    return profilesById?.[id] || "-";
  }

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
            {isFullAccess ? <button className="btn primary" onClick={() => router.push("/imersoes/nova")}>Criar a primeira</button> : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {statusOrder.map((status) => {
            const count = (grouped[status] || []).length;
            const isConcluded = status === "Concluída";
            const isCanceled = status === "Cancelada";
            const isCollapsible = isConcluded || isCanceled;
            const isCollapsed = isConcluded ? collapsedConcluded : isCanceled ? collapsedCanceled : false;

            return (
              <div className="card" key={status}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h3 style={{ margin: 0 }}>{status}</h3>
                    <span className={badgeClass(status)}>{count}</span>
                  </div>

                  {isCollapsible ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (isConcluded) setCollapsedConcluded((v) => !v);
                        if (isCanceled) setCollapsedCanceled((v) => !v);
                      }}
                      title={isCollapsed ? "Expandir" : "Recolher"}
                      style={{ height: 36 }}
                    >
                      {isCollapsed ? "Expandir" : "Recolher"}
                    </button>
                  ) : null}
                </div>

                {isCollapsible && isCollapsed ? null : (
                  <div style={{ marginTop: 8 }}>
                    {count === 0 ? (
                      <div className="muted" style={{ padding: "10px 2px" }}>
                        Sem imersões neste status.
                      </div>
                    ) : null}

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
                            {(() => {
                              const t = scheduleTag(it.start_date, it.end_date);
                              return (
                                <>
                                  {it.start_date} → {it.end_date} • <span className={t.cls}>{t.label}</span>
                                </>
                              );
                            })()}
                            {` • Consultor: ${displayNameById(it.educational_consultant)} • Designer: ${displayNameById(it.instructional_designer)}`}
                            {it.next_action?.title
                              ? ` • Próxima ação: ${it.next_action.title}${it.next_action.due_date ? ` (prazo ${it.next_action.due_date})` : ""}`
                              : ""}
                          </div>
                        </div>
                        <div className="listItemAside">
                          <span className="pill">{it.room_location || "-"}</span>
                          <span className="chev">›</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
