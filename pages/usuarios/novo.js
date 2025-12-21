import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { createProfile } from "../../lib/profiles";

const ROLES = [
  { key: "CONSULTOR", label: "Consultor" },
  { key: "DESIGNER", label: "Designer" },
  { key: "BASICO", label: "Básico" },
  { key: "ADMIN", label: "Administrador" }
];

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {children}
    </div>
  );
}

export default function NovoUsuarioPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", role: "BASICO", is_active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Preencha o nome.");

    try {
      setSaving(true);
      await createProfile({
        name: form.name.trim(),
        email: form.email.trim() || null,
        role: form.role,
        is_active: form.is_active
      });
      router.push("/usuarios");
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Novo usuário">
      <form className="card" onSubmit={onSubmit}>
        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        <Field label="Nome">
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>

        <Field label="Email (opcional)">
          <input className="input" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>

        <Field label="Tipo">
          <select className="input" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </Field>

        <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Ativo
        </label>

        <div className="row">
          <button type="button" className="btn" onClick={() => router.push("/usuarios")}>
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
