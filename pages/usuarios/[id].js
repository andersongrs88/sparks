import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { deleteProfile, getProfile, updateProfile } from "../../lib/profiles";

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

export default function EditarUsuarioPage() {
  const router = useRouter();
  const { id } = router.query;

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await getProfile(id);
        if (mounted) setForm(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [id]);

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    if (!form) return;

    setError("");
    if (!form.name.trim()) return setError("Preencha o nome.");

    try {
      setSaving(true);
      await updateProfile(form.id, {
        name: form.name.trim(),
        email: (form.email || "").trim() || null,
        role: form.role,
        is_active: !!form.is_active
      });
      alert("Salvo.");
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!form) return;
    const ok = confirm("Excluir este usuário? Essa ação não pode ser desfeita.");
    if (!ok) return;

    try {
      setRemoving(true);
      await deleteProfile(form.id);
      router.push("/usuarios");
    } catch (e) {
      setError(e?.message || "Falha ao excluir.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Layout title="Editar usuário">
      <form className="card" onSubmit={onSave}>
        {loading ? <div className="small">Carregando...</div> : null}
        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}
        {!loading && !form ? <div className="small">Usuário não encontrado.</div> : null}

        {form ? (
          <>
            <Field label="Nome">
              <input className="input" value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
            </Field>

            <Field label="Email (opcional)">
              <input className="input" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
            </Field>

            <Field label="Tipo">
              <select className="input" value={form.role || "BASICO"} onChange={(e) => set("role", e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </Field>

            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Ativo
            </label>

            <div className="row">
              <button type="button" className="btn" onClick={() => router.push("/usuarios")}>
                Voltar
              </button>

              <button type="button" className="btn danger" onClick={onDelete} disabled={removing}>
                {removing ? "Excluindo..." : "Excluir"}
              </button>

              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </Layout>
  );
}
