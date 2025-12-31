import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { loadEmailNotificationConfig, saveEmailNotificationConfig } from "../../lib/emailNotificationAdminApi";

function clampText(v) {
  return String(v ?? "").replace(/\r\n/g, "\n");
}

function RuleCard({ rule, template, onChangeRule, onChangeTemplate }) {
  const key = rule.rule_key;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800 }}>{rule.label || key}</div>
          <div className="muted" style={{ fontSize: 13 }}>{key}</div>
        </div>

        <label className="chip" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={rule.is_enabled !== false}
            onChange={(e) => onChangeRule(key, { is_enabled: e.target.checked })}
          />
          <span>Ativa</span>
        </label>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div>
          <label className="label">Assunto</label>
          <input
            className="input"
            value={clampText(template?.subject)}
            onChange={(e) => onChangeTemplate(key, { subject: e.target.value })}
            placeholder="Ex: Sparks • {{count}} pendências — {{date}}"
          />
        </div>
        <div>
          <label className="label">Placeholders</label>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
            {`{{count}}  {{date}}  {{name}}  {{app}}`}
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div>
          <label className="label">Texto inicial</label>
          <textarea
            className="textarea"
            rows={4}
            value={clampText(template?.intro)}
            onChange={(e) => onChangeTemplate(key, { intro: e.target.value })}
            placeholder="Ex: Olá {{name}}, aqui estão suas pendências…"
          />
        </div>
        <div>
          <label className="label">Rodapé</label>
          <textarea
            className="textarea"
            rows={4}
            value={clampText(template?.footer)}
            onChange={(e) => onChangeTemplate(key, { footer: e.target.value })}
            placeholder="Ex: Acesse: {{app}}"
          />
        </div>
      </div>
    </div>
  );
}

export default function NotificacoesEmailPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [settings, setSettings] = useState({ from_email: "", from_name: "", reply_to: "" });
  const [rules, setRules] = useState([]);
  const [templates, setTemplates] = useState({});
  const [logs, setLogs] = useState([]);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setErr("");
        setLoading(true);
        const data = await loadEmailNotificationConfig();
        if (!mounted) return;
        setSettings({
          from_email: data?.settings?.from_email || "",
          from_name: data?.settings?.from_name || "",
          reply_to: data?.settings?.reply_to || "",
        });
        setRules(data?.rules || []);
        setTemplates(data?.templates || {});
        setLogs(data?.logs || []);
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || "Erro ao carregar configurações.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const canEdit = isAdmin;

  const onChangeRule = (rule_key, patch) => {
    setRules((prev) => prev.map((r) => (r.rule_key === rule_key ? { ...r, ...patch } : r)));
  };

  const onChangeTemplate = (rule_key, patch) => {
    setTemplates((prev) => ({ ...prev, [rule_key]: { ...(prev?.[rule_key] || {}), ...patch } }));
  };

  const onSave = async () => {
    try {
      setErr("");
      setSaving(true);
      await saveEmailNotificationConfig({
        settings,
        rules,
        templates,
      });
      const refreshed = await loadEmailNotificationConfig();
      setLogs(refreshed?.logs || []);
    } catch (e) {
      setErr(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const headerRight = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" type="button" onClick={() => location.reload()} disabled={loading || saving}>
        Recarregar
      </button>
      <button className="btn primary" type="button" onClick={onSave} disabled={!canEdit || loading || saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );

  return (
    <Layout title="Notificações (E-mail)" headerRight={headerRight}>
      <div className="page">
        <h1 style={{ marginTop: 0 }}>Notificações (E-mail)</h1>
        <div className="muted" style={{ marginTop: 4 }}>
          Configure remetente e modelos de e-mail para notificações automáticas. Somente ADMIN.
        </div>

        {err ? <div className="alert" style={{ marginTop: 12 }}>{err}</div> : null}

        {!isAdmin ? (
          <div className="card" style={{ marginTop: 12 }}>
            <b>Acesso restrito.</b>
            <div className="muted">Apenas ADMIN pode acessar esta tela.</div>
          </div>
        ) : null}

        <div className="card" style={{ marginTop: 12, opacity: loading ? 0.7 : 1 }}>
          <h2 style={{ marginTop: 0 }}>Remetente</h2>
          <div className="grid2">
            <div>
              <label className="label">From e-mail</label>
              <input
                className="input"
                value={settings.from_email}
                onChange={(e) => setSettings((p) => ({ ...p, from_email: e.target.value }))}
                placeholder="ex: notificacoes@suaempresa.com"
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="label">From nome</label>
              <input
                className="input"
                value={settings.from_name}
                onChange={(e) => setSettings((p) => ({ ...p, from_name: e.target.value }))}
                placeholder="ex: Sparks"
                disabled={!canEdit}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="label">Reply-to (opcional)</label>
            <input
              className="input"
              value={settings.reply_to}
              onChange={(e) => setSettings((p) => ({ ...p, reply_to: e.target.value }))}
              placeholder="ex: suporte@suaempresa.com"
              disabled={!canEdit}
            />
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Se estiver vazio, o sistema usa EMAIL_FROM ou SMTP_USER do ambiente.
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Regras e templates</h2>
          {loading ? <div className="muted">Carregando...</div> : null}

          {(rules || []).map((r) => (
            <RuleCard
              key={r.rule_key}
              rule={r}
              template={templates?.[r.rule_key] || {}}
              onChangeRule={onChangeRule}
              onChangeTemplate={onChangeTemplate}
            />
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Logs recentes</h2>
          <div className="card">
            {(logs || []).length ? (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Regra</th>
                      <th>Modo</th>
                      <th>Destinatário</th>
                      <th>Itens</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleString()}</td>
                        <td>{l.rule_key}</td>
                        <td>{l.mode}</td>
                        <td>{l.to_email}</td>
                        <td>{l.item_count}</td>
                        <td>{l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">Nenhum log ainda.</div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
