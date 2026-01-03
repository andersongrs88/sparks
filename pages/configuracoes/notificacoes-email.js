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
    subject: "Sparks • Risco na imersão \"{{immersion}}\" — {{count}} atrasadas",
    intro: "Olá {{name}}, a imersão está com atrasos relevantes. Priorize as entregas abaixo:",
    footer: "Acesse: {{app}}"
  }
};

const PLACEHOLDERS = [
  { key: "{{name}}", label: "Nome do destinatário" },
  { key: "{{immersion}}", label: "Nome da imersão" },
  { key: "{{count}}", label: "Quantidade de itens (tarefas/pendências)" },
  { key: "{{date}}", label: "Data de referência do envio" },
  { key: "{{app}}", label: "Link do sistema" }
];

const RULE_META = {
  immersion_created: {
    title: "Imersão criada",
    feature: "Dispara um e-mail automaticamente quando uma nova imersão é criada.",
    cadenceLabel: "Evento — quando ocorrer",
    cadenceExample: "Exemplo: assim que uma imersão é criada",
    lookbackHelp:
      "Define a janela (em minutos) que o sistema considera para capturar o evento. Use 0 para apenas eventos novos."
  },
  task_overdue_daily: {
    title: "Tarefas atrasadas",
    feature: "Envia um resumo diário com tarefas vencidas do responsável.",
    cadenceLabel: "Diária",
    cadenceExample: "Exemplo: todos os dias pela manhã (conforme agendamento do cron)",
    lookbackHelp:
      "Define a janela (em minutos) analisada para identificar tarefas vencidas. Em geral, 60 minutos é suficiente."
  },
  task_due_soon_weekly: {
    title: "Tarefas vencendo em até 7 dias",
    feature: "Envia um resumo semanal com tarefas que vencem nos próximos 7 dias.",
    cadenceLabel: "Semanal",
    cadenceExample: "Exemplo: toda segunda-feira (conforme agendamento do cron)",
    lookbackHelp:
      "Janela (em minutos) para verificação. Para semanal, normalmente 10080 (7 dias)."
  },
  immersion_risk_daily: {
    title: "Risco na imersão",
    feature: "Alerta diário quando uma imersão acumula atrasos e entra em risco.",
    cadenceLabel: "Diária",
    cadenceExample: "Exemplo: todos os dias pela manhã (conforme agendamento do cron)",
    lookbackHelp:
      "Janela (em minutos) para verificação do risco. Em geral, 60 minutos é suficiente."
  }
};

function getRuleMeta(kind) {
  return RULE_META[kind] || {
    title: kind,
    feature: "Configuração de notificação automática.",
    cadenceLabel: "—",
    cadenceExample: "",
    lookbackHelp: "Janela (em minutos) de verificação."
  };
}



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
  const [senderOpen, setSenderOpen] = useState(true);

  const isAdmin = String(role || profile?.role || "").toLowerCase() === "admin";

  async function load() {
    setError("");
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/email-notification-config");

      const rulesNorm = (data.rules || []).map((r) => ({
        ...r,
        // compat com schema novo (rule_key) e legado (kind)
        kind: r.kind || r.rule_key
      }));

      setRules(rulesNorm);
      setLogs(data.logs || []);
      setSettings({
        from_email: data.settings?.from_email || "",
        from_name: data.settings?.from_name || "",
        reply_to: data.settings?.reply_to || ""
      });

      // templates podem vir como objeto (novo) ou array (legado)
      const templatesArr = Array.isArray(data.templates)
        ? data.templates
        : Object.entries(data.templates || {}).map(([kind, t]) => ({ kind, ...(t || {}) }));

      const byKind = new Map((templatesArr || []).map((t) => [t.kind, t]));
      const merged = (rulesNorm || []).map((r) => normTemplate(r.kind, byKind.get(r.kind)));
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
      const templatesObj = (templates || []).reduce((acc, t) => {
        acc[t.kind] = {
          subject: t.subject || "",
          intro: t.intro || "",
          footer: t.footer || ""
        };
        return acc;
      }, {});

      await adminFetch("/api/admin/email-notification-config", {
        method: "POST",
        body: { settings, rules, templates: templatesObj }
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

        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Remetente</h2>
              <button
                className="btn"
                type="button"
                onClick={() => setSenderOpen((v) => !v)}
                aria-expanded={senderOpen}
                aria-controls="sender-section"
              >
                {senderOpen ? "Recolher" : "Expandir"}
              </button>
            </div>

            <div id="sender-section" style={{ marginTop: 12, display: senderOpen ? "grid" : "none", gap: 12 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ marginBottom: 6 }}>Regras e templates</h2>
                <div className="muted">
                  Configure quais notificações serão enviadas e edite o conteúdo do e-mail. As variáveis (placeholders) permitem personalizar o texto por usuário e imersão.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn" type="button" onClick={load} disabled={loading || saving}>
                  Atualizar
                </button>
                <button className="btn primary" type="button" onClick={onSave} disabled={loading || saving}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>

            {loading ? <div className="muted" style={{ marginTop: 10 }}>Carregando...</div> : null}

            <div className="card" style={{ padding: 12, marginTop: 14, background: "var(--bg-soft, #f7f8fb)" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Variáveis disponíveis (placeholders)</div>
              <div className="muted" style={{ marginBottom: 10 }}>
                Use estas variáveis no assunto, no texto inicial e no rodapé para inserir informações automaticamente.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {PLACEHOLDERS.map((p) => (
                  <span key={p.key} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 999, background: "#fff" }} title={p.label}>
                    <code style={{ fontWeight: 800 }}>{p.key}</code>
                    <span className="muted" style={{ marginLeft: 8 }}>{p.label}</span>
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
              {(rules || []).map((r) => {
                const meta = getRuleMeta(r.kind);
                const t = templatesByKind.get(r.kind) || normTemplate(r.kind, null);

                return (
                  <div key={r.kind} className="card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1 }}>{meta.title}</div>
                        <div className="muted" style={{ marginTop: 4 }}>
                          <code>{r.kind}</code>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <label className="switch" title="Ativar/Desativar regra">
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

                        <button className="btn primary" type="button" onClick={onSave} disabled={loading || saving}>
                          {saving ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }} className="muted">
                      {meta.feature}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>Cadência</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{meta.cadenceLabel}</div>
                        {meta.cadenceExample ? <div className="muted" style={{ marginTop: 6 }}>{meta.cadenceExample}</div> : null}
                      </div>

                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>Janela de verificação (minutos)</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{Number(r.lookback_minutes ?? 0)}</div>
                        <div className="muted" style={{ marginTop: 6 }}>{meta.lookbackHelp}</div>
                      </div>

                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.2 }}>Status</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{r.is_enabled ? "Ativa" : "Desativada"}</div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          Dica: desative temporariamente para pausar envios sem perder o modelo.
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                      <label className="label">
                        Assunto do e-mail
                        <div className="muted" style={{ marginTop: 4 }}>
                          Exemplo: <code>{"Sparks • {{count}} pendências — {{date}}"}</code>
                        </div>
                        <input
                          className="input"
                          value={t.subject}
                          onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, subject: e.target.value } : x)))}
                          placeholder="Digite o assunto..."
                        />
                      </label>

                      <label className="label">
                        Texto inicial (corpo)
                        <div className="muted" style={{ marginTop: 4 }}>
                          Texto principal exibido no e-mail. Use placeholders para personalizar.
                        </div>
                        <textarea
                          className="input"
                          value={t.intro}
                          onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, intro: e.target.value } : x)))}
                          rows={6}
                          placeholder={'Olá {{name}},\n\nEscreva aqui a mensagem principal...'}
                        />
                      </label>

                      <label className="label">
                        Rodapé (opcional)
                        <div className="muted" style={{ marginTop: 4 }}>
                          Texto exibido no final do e-mail. Ideal para links e orientações finais.
                        </div>
                        <textarea
                          className="input"
                          value={t.footer}
                          onChange={(e) => setTemplates((prev) => prev.map((x) => (x.kind === r.kind ? { ...x, footer: e.target.value } : x)))}
                          rows={3}
                          placeholder={"Acesse: {{app}}"}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
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
