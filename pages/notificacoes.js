import Layout from "../components/Layout";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { requireAuth } from "../lib/auth";
import { classifyTask, getNotificationSummary } from "../lib/notifications";
import {
  getBrowserNotificationPermission,
  isBrowserNotificationsEnabled,
  isBrowserNotificationsSupported,
  requestBrowserNotificationPermission,
  setBrowserNotificationsEnabled,
} from "../lib/browserNotifications";

function formatDate(d) {
  if (!d) return "-";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function NotificacoesPage() {
  const router = useRouter();
  const { loading, user, profile, isFullAccess } = useAuth();
  const [summary, setSummary] = useState({ overdue: 0, today: 0, soon: 0, total: 0, items: [] });
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [perm, setPerm] = useState("unknown");

  useEffect(() => {
    if (loading) return;
    requireAuth(router);
  }, [loading, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setBrowserEnabled(isBrowserNotificationsEnabled());
      setPerm(getBrowserNotificationPermission());
    } catch {
      setBrowserEnabled(false);
      setPerm("unknown");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user) return;
      try {
        const res = await getNotificationSummary({ user, profile, isFullAccess });
        if (!alive) return;
        setSummary(res);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setSummary({ overdue: 0, today: 0, soon: 0, total: 0, items: [] });
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.id, profile?.role, isFullAccess]);

  const grouped = useMemo(() => {
    const today = new Date();
    const g = { overdue: [], today: [], soon: [] };
    for (const t of (summary.items || [])) {
      const b = classifyTask(t, today);
      if (b === "overdue") g.overdue.push(t);
      else if (b === "today") g.today.push(t);
      else if (b === "soon") g.soon.push(t);
    }
    // prioridade: atrasadas, hoje, próximas (já vem filtrado <= 7 dias)
    return g;
  }, [summary.items]);

  return (
    <Layout title="Notificações">
      <div className="card">
        <h2>Notificações</h2>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Notificações no navegador</div>
              <div className="small muted">
                Status: {isBrowserNotificationsSupported() ? perm : "Indisponível neste navegador"}
              </div>
            </div>

            <div className="row" style={{ gap: 8 }}>
              {!isBrowserNotificationsSupported() ? null : (
                browserEnabled ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setBrowserNotificationsEnabled(false);
                      setBrowserEnabled(false);
                    }}
                  >
                    Desativar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const p = await requestBrowserNotificationPermission();
                      setPerm(p);
                      if (p === "granted") {
                        setBrowserNotificationsEnabled(true);
                        setBrowserEnabled(true);
                      }
                    }}
                  >
                    Ativar
                  </button>
                )
              )}
            </div>
          </div>

          {isBrowserNotificationsSupported() && perm === "denied" ? (
            <p className="small" style={{ marginTop: 10 }}>
              Você bloqueou as notificações. Para ativar, libere nas configurações do navegador (Site settings → Notifications) e recarregue esta página.
            </p>
          ) : null}
          <p className="small" style={{ marginTop: 10 }}>
            Quando ativado, o sistema notifica automaticamente ao surgir aumento de tarefas atrasadas ou vencendo hoje (enquanto o sistema estiver aberto).
          </p>
        </div>
        <p style={{ marginTop: 0 }}>
          Atrasadas: <b>{summary.overdue}</b> | Vencem hoje: <b>{summary.today}</b> | Próximos 7 dias: <b>{summary.soon}</b>
        </p>

        <Section title="Atrasadas" items={grouped.overdue} />
        <Section title="Vencem hoje" items={grouped.today} />
        <Section title="Próximos 7 dias" items={grouped.soon} />
      </div>
    </Layout>
  );
}

function Section({ title, items }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>{title} ({items.length})</h3>
      {items.length === 0 ? <p style={{ marginTop: 0, opacity: 0.8 }}>Sem itens.</p> : null}
      {items.map((t) => (
        <div key={t.id} className="row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t.title}</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Imersão: {t.immersions?.immersion_name || "-"} | Fase: {t.phase} | Área: {t.area || "-"} | Prazo: {formatDate(t.due_date)}
            </div>
          </div>
          <a className="btn" href={`/imersoes/${t.immersion_id}`}>Abrir</a>
        </div>
      ))}
    </div>
  );
}
