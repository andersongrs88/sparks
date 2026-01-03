import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { getEmailNotificationConfig, saveEmailNotificationConfig } from "../../lib/admin";
import { Switch } from "../../components/Switch";

export default function NotificacoesEmail() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await getEmailNotificationConfig();
    setConfig(data);
  }

  async function handleSave() {
    setSaving(true);
    await saveEmailNotificationConfig(config);
    setSaving(false);
    alert("Configurações salvas com sucesso");
  }

  if (!config) return null;

  const templates = Array.isArray(config.templates)
    ? config.templates
    : Object.values(config.templates || {});

  return (
    <Layout title="Notificações (E-mail)">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Notificações (E-mail)</h1>
          <p className="text-sm text-gray-500">
            Configure quem envia, quando o sistema envia e o conteúdo dos e-mails.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full md:w-auto px-6 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>

      {/* REMETENTE */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">Remetente</h2>
        <p className="text-sm text-gray-500 mb-4">
          Informações usadas como remetente padrão dos e-mails.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="From e-mail"
            value={config.from_email || ""}
            onChange={(v) => setConfig({ ...config, from_email: v })}
          />
          <Field
            label="From name"
            value={config.from_name || ""}
            onChange={(v) => setConfig({ ...config, from_name: v })}
          />
          <Field
            label="Reply-to"
            value={config.reply_to || ""}
            onChange={(v) => setConfig({ ...config, reply_to: v })}
          />
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Se vazio, o sistema usa ENV_EMAIL_FROM / SMTP_USER.
        </p>
      </section>

      {/* REGRAS E TEMPLATES */}
      <section className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-1">Regras e templates</h2>
        <p className="text-sm text-gray-500 mb-6">
          Ative as notificações e personalize o conteúdo do e-mail.
        </p>

        <div className="space-y-4">
          {templates.map((tpl) => (
            <details key={tpl.kind} className="border rounded-lg p-4">
              <summary className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">{tpl.title}</p>
                  <p className="text-xs text-gray-500">{tpl.kind}</p>
                </div>
                <Switch
                  checked={tpl.enabled}
                  onChange={(checked) => {
                    setConfig({
                      ...config,
                      templates: templates.map((t) =>
                        t.kind === tpl.kind ? { ...t, enabled: checked } : t
                      ),
                    });
                  }}
                />
              </summary>

              <div className="mt-4 space-y-3">
                <Field
                  label="Assunto"
                  value={tpl.subject || ""}
                  onChange={(v) => {
                    setConfig({
                      ...config,
                      templates: templates.map((t) =>
                        t.kind === tpl.kind ? { ...t, subject: v } : t
                      ),
                    });
                  }}
                />

                <TextArea
                  label="Corpo do e-mail"
                  value={tpl.body || ""}
                  onChange={(v) => {
                    setConfig({
                      ...config,
                      templates: templates.map((t) =>
                        t.kind === tpl.kind ? { ...t, body: v } : t
                      ),
                    });
                  }}
                />
              </div>
            </details>
          ))}
        </div>
      </section>
    </Layout>
  );
}

/* COMPONENTES AUXILIARES */

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
      />
    </div>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <textarea
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
      />
    </div>
  );
}
