import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { adminFetch } from "../../lib/adminFetch";

const DEFAULTS = {
  immersion_created: {
    subject: "Sparks • Nova imersão criada — {{immersion}}",
    intro: "Olá {{name}}, uma nova imersão foi criada no sistema: {{immersion}}.",
    footer: "Acesse para ver detalhes e tarefas: {{app}}"
  },
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
    subject: "Sparks • Imersão em risco — {{immersion}} — {{date}}",
    intro: "Olá {{name}}, a imersão {{immersion}} entrou em risco (tarefas atrasadas acumuladas).",
    footer: "Acesse para ver detalhes e agir: {{app}}"
  },
};

const RULES_META = {
  immersion_created: {
    title: "Imersão criada",
    feature: "Envia um e-mail quando uma nova imersão é criada.",
    cadenceLabel: "Evento",
    cadenceExample: "Exemplo: imediatamente após criação",
    lookbackHelp: "Janela (minutos) para capturar o evento. Use 0 para apenas eventos novos."
  },
  task_overdue_daily: {
    title: "Tarefas atrasadas",
    feature: "Envia um resumo diário com tarefas vencidas do responsável.",
    cadenceLabel: "Diária",
    cadenceExample: "Exemplo: todos os dias pela manhã (cron)",
    lookbackHelp: "Janela (minutos) analisada para identificar tarefas vencidas."
  },
  task_due_soon_weekly: {
    title: "Tarefas vencendo em até 7 dias",
    feature: "Envia um resumo semanal com tarefas que vencem nos próximos 7 dias.",
    cadenceLabel: "Semanal",
    cadenceExample: "Exemplo: toda segunda-feira (cron)",
    lookbackHelp: "Janela (minutos) usada para consolidar envios."
  },
  immersion_risk_daily: {
    title: "Risco na imersão",
    feature: "Alerta diário quando uma imersão acumula atrasos e entra em risco.",
    cadenceLabel: "Diária",
    cadenceExample: "Exemplo: todos os dias (cron)",
    lookbackHelp: "Janela (minutos) usada para consolidar envios."
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

function coerceTemplateList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function safeKind(obj) {
  return obj?.kind || obj?.rule_key || obj?.ruleKey || null;
}

export default function NotificacoesEmail() {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState({ from_email: "", from_name: "", reply_to: "" });
  const [rules, setRules] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);

  const [senderOpen, setSenderOpen] = useState(true);
  const [search, setSearch] = useState("");

  const isAdmin = String(profile?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    if (!profile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/email-notification-config", { method: "GET" });

      const incomingRules = Array.isArray(data.rules) ? data.rules : [];
      const normalizedRules = incomingRules.map((r) => ({ ...r, kind: safeKind(r) })).filter((r) => !!r.kind);

      setRules(normalizedRules);
      setLogs(Array.isArray(data.logs) ? data.logs : []);

      setSettings({
        from_email: data.settings?.from_email || "",
        from_name: data.settings?.from_name || "",
        reply_to: data.settings?.reply_to || ""
      });

      const list = coerceTemplateList(data.templates);
      const byKind = new Map(list.map((t) => [safeKind(t), t]).filter(([k]) => !!k));

      const merged = normalizedRules.map((r) => normTemplate(r.kind, byKind.get(r.kind)));
      setTemplates(merged);
    } catch (e) {
      setError(e?.message || "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    setError("");
    setSaving(true);
    try {
      // templates precisam ir como objeto (por kind/rule_key) para o endpoint atual
      const templatesObj = {};
      for (const t of templates) {
        templatesObj[t.kind] = { subject: t.subject, intro: t.intro, footer: t.footer };
      }

      // rules: envie o mínimo necessário para persistência
      const outgoingRules = rules.map((r) => ({
        rule_key: r.rule_key || r.kind,
        enabled: !!r.enabled,
        cadence: r.cadence ?? r.cadence_minutes ?? null,
        lookback: r.lookback ?? r.lookback_minutes ?? null
      }));

      await adminFetch("/api/admin/email-notification-config", {
        method: "POST",
        body: { settings, rules: outgoingRules, templates: templatesObj }
      });

      await load();
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const filteredTemplates = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const meta = RULES_META[t.kind] || {};
      return (
        t.kind.toLowerCase().includes(q) ||
        String(meta.title || "").toLowerCase().includes(q) ||
        String(meta.feature || "").toLowerCase().includes(q)
      );
    });
  }, [templates, search]);

  function setRuleEnabled(kind, enabled) {
    setRules((prev) => prev.map((r) => (r.kind === kind ? { ...r, enabled } : r)));
  }

  function setTemplate(kind, patch) {
    setTemplates((prev) => prev.map((t) => (t.kind === kind ? { ...t, ...patch } : t)));
  }

  if (!isAdmin) {
    return (
      <Layout title="Notificações (E-mail)">
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Acesso restrito</div>
          <div className="muted">Apenas administradores podem configurar notificações de e-mail.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Notificações (E-mail)">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Notificações (E-mail)</h1>
          <div className="muted">
            Configure remetente e templates. As regras são controladas pelo banco (kind/cadence/lookback).
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={load} disabled={loading || saving}>
            Atualizar
          </button>
          <button className="btn primary" type="button" onClick={onSave} disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="error" style={{ marginTop: 14 }}>
          Erro: {error}
        </div>
      ) : null}

      {/* Remetente (coluna única + recolher) */}
      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Remetente</h2>
          <button
            type="button"
            className="btn"
            aria-expanded={senderOpen ? "true" : "false"}
            aria-controls="sender-panel"
            onClick={() => setSenderOpen((v) => !v)}
          >
            {senderOpen ? "Recolher" : "Expandir"}
          </button>
        </div>

        {senderOpen ? (
          <div id="sender-panel" style={{ marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, maxWidth: 760 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="label">From e-mail</span>
                <input
                  className="input"
                  value={settings.from_email}
                  onChange={(e) => setSettings((s) => ({ ...s, from_email: e.target.value }))}
                  placeholder="ex.: no-reply@seudominio.com"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="label">From name</span>
                <input
                  className="input"
                  value={settings.from_name}
                  onChange={(e) => setSettings((s) => ({ ...s, from_name: e.target.value }))}
                  placeholder="ex.: Educagrama"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="label">Reply-to</span>
                <input
                  className="input"
                  value={settings.reply_to}
                  onChange={(e) => setSettings((s) => ({ ...s, reply_to: e.target.value }))}
                  placeholder="ex.: suporte@seudominio.com"
                />
              </label>
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Se vazio, o sistema usa fallback via ENV <code>EMAIL_FROM</code> / <code>SMTP_USER</code>.
            </div>
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            Se vazio, o sistema usa fallback via ENV <code>EMAIL_FROM</code> / <code>SMTP_USER</code>.
          </div>
        )}
      </div>

      {/* Regras e templates */}
      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginBottom: 6 }}>Regras e templates</h2>
            <div className="muted">
              Ative/desative notificações e edite o conteúdo do e-mail. As variáveis (placeholders) permitem personalizar o texto.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, maxWidth: 760 }}>
          <div className="label" style={{ marginBottom: 6 }}>Buscar regra</div>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex.: tarefas, risco, weekly..."
          />
        </div>

        <div className="card" style={{ padding: 12, marginTop: 14, background: "var(--bg-soft, #f7f8fb)" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Variáveis disponíveis (placeholders)</div>
          <div className="muted" style={{ marginBottom: 10 }}>
            Use estas variáveis no assunto, no texto inicial e no rodapé para inserir informações automaticamente.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <span className="chip">
              <code>{"{{name}}"}</code> <span className="muted">Nome do destinatário</span>
            </span>
            <span className="chip">
              <code>{"{{immersion}}"}</code> <span className="muted">Nome da imersão</span>
            </span>
            <span className="chip">
              <code>{"{{count}}"}</code> <span className="muted">Quantidade de itens</span>
            </span>
            <span className="chip">
              <code>{"{{date}}"}</code> <span className="muted">Data de referência</span>
            </span>
            <span className="chip">
              <code>{"{{app}}"}</code> <span className="muted">Link do sistema</span>
            </span>
          </div>
        </div>

        {loading ? <div className="muted" style={{ marginTop: 10 }}>Carregando...</div> : null}

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {filteredTemplates.map((t) => {
            const meta = RULES_META[t.kind] || {};
            const rule = rules.find((r) => r.kind === t.kind);
            const enabled = !!rule?.enabled;

            return (
              <details key={t.kind} className="card" style={{ padding: 14 }}>
                <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
                  <div style={{ display: "grid", gap: 3 }}>
                    <div style={{ fontWeight: 900 }}>{meta.title || t.kind}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{t.kind}</div>
                    {meta.feature ? <div className="muted" style={{ marginTop: 2 }}>{meta.feature}</div> : null}
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="badge">{enabled ? "Ativa" : "Inativa"}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setRuleEnabled(t.kind, e.target.checked)}
                      aria-label={`Ativar ${meta.title || t.kind}`}
                    />
                  </label>
                </summary>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="label">Assunto do e-mail</span>
                    <input
                      className="input"
                      value={t.subject}
                      onChange={(e) => setTemplate(t.kind, { subject: e.target.value })}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="label">Texto inicial (corpo)</span>
                    <textarea
                      className="input"
                      rows={5}
                      value={t.intro}
                      onChange={(e) => setTemplate(t.kind, { intro: e.target.value })}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      Texto principal exibido no e-mail. Use placeholders para personalizar.
                    </span>
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span className="label">Rodapé (opcional)</span>
                    <textarea
                      className="input"
                      rows={4}
                      value={t.footer}
                      onChange={(e) => setTemplate(t.kind, { footer: e.target.value })}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>
                      Texto exibido no final do e-mail. Ideal para links e orientações finais.
                    </span>
                  </label>
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Logs */}
      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h2 style={{ marginBottom: 6 }}>Logs recentes</h2>
        <div className="muted">Últimos 50 registros do disparo do cron (preview/send).</div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
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
              {(logs || []).map((l, idx) => (
                <tr key={idx}>
                  <td style={{ whiteSpace: "nowrap" }}>{l.created_at ? new Date(l.created_at).toLocaleString() : "-"}</td>
                  <td>{l.kind || "-"}</td>
                  <td>{l.to_email || "-"}</td>
                  <td>{typeof l.items_count === "number" ? l.items_count : "-"}</td>
                  <td>{l.mode || "-"}</td>
                  <td>{l.status || "-"}</td>
                  <td style={{ maxWidth: 360 }} title={l.error || ""}>
                    {l.error || "-"}
                  </td>
                </tr>
              ))}
              {!logs?.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhum log encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
