import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { createProfile } from "../../lib/profiles";
import { generatePasswordSuggestion, hashPassword } from "../../lib/auth";

const ROLES = [
  { key: "CONSULTOR", label: "Consultor" },
  { key: "DESIGNER", label: "Designer" },
  { key: "BASICO", label: "Básico" },
  { key: "ADMIN", label: "Administrador" }
];

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "imersoes", label: "Imersões" },
  { key: "usuarios", label: "Usuários" }
];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {hint ? <div className="small" style={{ marginBottom: 6 }}>{hint}</div> : null}
      {children}
    </div>
  );
}

export default function NovoUsuarioPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "BASICO",
    is_active: true,
    modules: ["dashboard", "imersoes"],
    password: ""
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  const roleDefaultModules = useMemo(() => {
    // defaults simples (você pode mudar depois)
    if (form.role === "ADMIN") return ["dashboard", "imersoes", "usuarios"];
    if (form.role === "CONSULTOR" || form.role === "DESIGNER") return ["dashboard", "imersoes"];
    return ["dashboard", "imersoes"];
  }, [form.role]);

  function applyRoleDefaults() {
    setForm((p) => ({ ...p, modules: roleDefaultModules }));
  }

  async function onGeneratePassword() {
    const suggestion = generatePasswordSuggestion();
    set("password", suggestion);
    try {
      await navigator.clipboard.writeText(suggestion);
      alert("Senha sugerida copiada. Agora cole e compartilhe com o usuário.");
    } catch {
      // sem clipboard: apenas preenche o campo
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Preencha o nome.");
      return;
    }

    try {
      setSaving(true);

      // senha (opcional)
      let password_hash = null;
      if ((form.password || "").trim().length > 0) {
        password_hash = await hashPassword(form.password.trim());
      }

      await createProfile({
        name: form.name.trim(),
        email: form.email.trim() || null,
        role: form.role,
        is_active: !!form.is_active,
        modules: form.modules,
        password_hash
      });

      router.push("/usuarios");
    } catch (e2) {
      setError(e2?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Novo usuário">
      <form className="card" onSubmit={onSubmit}>
        <div className="h2">Cadastrar usuário</div>
        <div className="small" style={{ marginBottom: 12 }}>
          Este usuário aparecerá no campo <b>Responsável</b> ao criar tarefas do Checklist.
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        <Field label="Nome">
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <Field label="Email (opcional)">
          <input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>

        <Field label="Tipo" hint="Você pode clicar em 'Aplicar padrão do tipo' para preencher as permissões automaticamente.">
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <select className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
            </select>

            <button type="button" className="btn" onClick={applyRoleDefaults}>
              Aplicar padrão do tipo
            </button>
          </div>
        </Field>

        <Field label="Permissões de acesso" hint="Marque quais módulos esse usuário pode abrir no menu.">
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {MODULES.map((m) => {
              const checked = (form.modules || []).includes(m.key);
              return (
                <label key={m.key} className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setForm((p) => {
                        const prev = new Set(p.modules || []);
                        if (on) prev.add(m.key);
                        else prev.delete(m.key);
                        return { ...p, modules: Array.from(prev) };
                      });
                    }}
                  />
                  {m.label}
                </label>
              );
            })}
          </div>
        </Field>

        <Field
          label="Senha (opcional)"
          hint="Sugestão para você enviar ao usuário. Se você deixar vazio, o login não vai aceitar senha para este usuário."
        >
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <input
              className="input"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Clique em gerar ou digite uma senha"
            />
            <button type="button" className="btn" onClick={onGeneratePassword}>
              Gerar sugestão
            </button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Importante: isso é um controle simples para o seu sistema. Em projetos maiores, o ideal é usar Supabase Auth.
          </div>
        </Field>

        <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Ativo
        </label>

        <div className="row">
          <button type="button" className="btn" onClick={() => router.push("/usuarios")} disabled={saving}>
            Cancelar
          </button>

          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Layout>
  );
}
