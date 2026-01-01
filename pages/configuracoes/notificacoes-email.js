import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { adminFetch } from "../../lib/adminFetch";

const DEFAULTS = {
  task_overdue_daily: {
    subject: "Sparks • {{count}} tarefa(s) atrasada(s) — {{date}}",
    intro: "Olá {{name}}, você tem tarefas atrasadas. Priorize as entregas listadas abaixo:",
    footer: "Acesse: {{app}}"
  },
  task_due_soon_weekly: {
    subject: "Sparks • {{count}} tarefa(s) vencem em até 7 dias — {{date}}",
    intro: "Olá {{name}}, estas tarefas vencem em breve (próximos 7 dias):",
    footer: "Acesse: {{app}}"
  },
  immersion_risk_daily: {
    subject: "Sparks • Risco na imersão \"{{immersion}}\" — {{count}} atrasadas",
    intro: "Olá {{name}}, a imersão está com atrasos relevantes. Priorize as entregas abaixo:",
    footer: "Acesse: {{app}}"
  }
};

function normTemplate(kind, t) {
  const d = DEFAULTS[kind] || {};
  return {
    kind,
    subject: t?.subject ?? d.subject ?? "",
    intro: t?.intro ?? d.intro ?? "",
    footer: t?.footer ?? d.footer ?? ""
  };
}

export default function NotificacoesEmailPage() {
  const { user, profile, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState({ from_email: "", from_name: "", reply_to: "" });
  const [rules, setRules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);

  const isAdmin = String(role || profile?.role || "").toLowerCase() === "admin";

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/email-notification-config");
      setRules(data.rules || []);
      setLogs(data.logs || []);
      setSettings({
        from_email: data.settings?.from_email || "",
        from_name: data.settings?.from_name || "",
        reply_to: data.settings?.reply_to || ""
      });

      const byKind = new Map((data.templates || []).map((t) => [t.kind, t]));
      const merged = (data.rules || []).map((r) => normTemplate(r.kind, byKind.get(r.kind)));
      setTemplates(merged);
    } catch (e) {
      setError(e?.message || "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.id || user.id === "noauth") return;
    if (!isAdmin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const templatesByKind = useMemo(() => {
    const m = new Map();
    for (const t of templates) m.set(t.kind, t);
    return m;
  }, [templates]);

  async function onSave() {
    setError("");
    setSaving(true);
    try {
      await adminFetch("/api/admin/email-notification-config", {
        method: "POST",
        body: { settings, rules, templates }
      });
      await load();
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!user?.id || user.id === "noauth") {
    return (
      <Layout title="Notificações (E-mail)">
        <div className="card" style={{ padding: 16 }}>
          <h2>Notificações (E-mail)</h2>
          <p>Você precisa estar logado para acessar esta página.</p>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout title="Notificações (E-mail)">
        <div className="card" style={{ padding: 16 }}>
          <h2>Notificações (E-mail)</h2>
          <p>Apenas ADMIN pode acessar esta página.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Notificações (E-mail)">
      <div className="page">
        <div className="pageHeader">
          <div>
            <h1>Notificações (E-mail)</h1>
            <div className="muted">Configure remetente e templates. As regras são controladas pelo banco (kind/cadence/lookback).</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={load} disabled={loading || saving}>Atualizar</button>
            <button className="btn primary" type="button" onClick={onSave} disabled={loading || saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 12, borderColor: "#ffb4b4" }}>
            <b>Erro:</b> {error}
          </div>
        ) : null}

        <div className="grid2">
          <div className="card" style={{ padding: 16 }}>
            <h2>Remetente</h2>
            <div className="formGrid">
              <label className="label">
                From e-mail
                <input className="input" value={settings.from_email} onChange={(e) => setSettings((s) => ({ ...s, from_email: e.target.value }))} placeholder="ex: notificacoes@seudominio.com" />
              </label>
              <label className="label">
                From nome
                <input className="input" value={settings.from_name} onChange={(e) => setSettings((s) => ({ ...s, from_name: e.target.value }))} placeholder="ex: Sparks" />
              </label>
              <label className="label">
                Reply-to
                <input className="input" value={settings.reply_to} onChange={(e) => setSettings((s) => ({ ...s, reply_to: e.target.value }))} placeholder="ex: suporte@seudominio.com" />
              </label>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Se vazio, o sistema usa fallback via ENV <code>EMAIL_FROM</code> / <code>SMTP_USER</code>.
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h2>Regras</h2>
            {loading ? <div className="muted">Carregando...</div> : null}
            <div style={{ display: "grid", gap: 10 }}>
              {(rules || []).map((r) => (
                <div key={r.kind} className="ruleRow">
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.kind}</div>
                    <div className="muted">cadence: {r.cadence} · lookback: {r.lookback_minutes} min</div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={!!r.is_enabled}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setRules((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, is_enabled: v } : x)));
                      }}
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h2>Templates</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            Placeholders: <code>{"{{count}}"}</code> <code>{"{{date}}"}</code> <code>{"{{name}}"}</code> <code>{"{{app}}"}</code> <code>{"{{immersion}}"}</code>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {(rules || []).map((r) => {
              const t = templatesByKind.get(r.kind) || normTemplate(r.kind, null);
              return (
                <div key={r.kind} className="card" style={{ padding: 12, borderStyle: "dashed" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{r.kind}</div>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        const d = DEFAULTS[r.kind];
                        if (!d) return;
                        setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, ...d } : x)));
                      }}
                    >
                      Reset padrão
                    </button>
                  </div>

                  <label className="label" style={{ marginTop: 10 }}>
                    Assunto
                    <input
                      className="input"
                      value={t.subject}
                      onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, subject: e.target.value } : x)))}
                    />
                  </label>

                  <label className="label" style={{ marginTop: 10 }}>
                    Intro (texto)
                    <textarea
                      className="textarea"
                      value={t.intro}
                      onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, intro: e.target.value } : x)))}
                      rows={3}
                    />
                  </label>

                  <label className="label" style={{ marginTop: 10 }}>
                    Rodapé (texto)
                    <textarea
                      className="textarea"
                      value={t.footer}
                      onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, footer: e.target.value } : x)))}
                      rows={2}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h2>Logs recentes</h2>
          <div className="muted" style={{ marginBottom: 12 }}>Últimos 50 registros do disparo do cron (preview/send).</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Kind</th>
                  <th>Para</th>
                  <th>Itens</th>
                  <th>Modo</th>
                  <th>Status</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.kind}</td>
                    <td>{l.to_email || "-"}</td>
                    <td>{l.item_count}</td>
                    <td>{l.mode}</td>
                    <td>{l.status}</td>
                    <td style={{ maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.error || ""}</td>
                  </tr>
                ))}
                {!logs?.length ? (
                  <tr>
                    <td colSpan={7} className="muted">Sem logs.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  );
}
