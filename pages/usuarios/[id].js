import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { deleteProfile, getProfile, setUserPassword, updateProfile } from "../../lib/profiles";

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "consultor_educacao", label: "Consultor de Educação" },
  { key: "designer", label: "Designer" },

  // Acesso básico (somente visualização)
  { key: "eventos", label: "Eventos (visualização)" },
  { key: "tecnica", label: "Técnica (visualização)" },
  { key: "relacionamento", label: "Relacionamento (visualização)" },
  { key: "producao", label: "Produção (visualização)" },
  { key: "mentoria", label: "Mentoria (visualização)" },
  { key: "viewer", label: "Visualização" }
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

export default function EditarUsuarioPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();
  const { id } = router.query;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [tab, setTab] = useState("dados");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await getProfile(id);
        if (mounted) setForm(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar usuário.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    if (!form) return;

    setError("");
    if (!form.name?.trim()) {
      setError("Preencha o nome.");
      return;
    }

    try {
      setSaving(true);
      await updateProfile(form.id, {
        name: form.name.trim(),
        email: (form.email || "").trim() || null,
        role: form.role || "viewer",
        is_active: !!form.is_active
      });

      alert("Usuário salvo.");
    } catch (e2) {
      setError(e2?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword() {
    if (!form) return;
    setError("");
    const pwd = String(newPassword || "");
    if (pwd.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    try {
      setPwdBusy(true);
      await setUserPassword(form.id, pwd);
      setNewPassword("");
      alert("Senha atualizada.");
    } catch (e) {
      setError(e?.message || "Falha ao atualizar senha.");
    } finally {
      setPwdBusy(false);
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
    } catch (e2) {
      setError(e2?.message || "Falha ao excluir.");
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
            <div className="h2">Editar usuário</div>
            <div className="small" style={{ marginBottom: 12 }}>
              Você pode desativar o usuário para ele não aparecer como responsável nas tarefas.
            </div>

            <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className={tab === "dados" ? "btn primary" : "btn"}
                onClick={() => setTab("dados")}
              >
                Dados
              </button>
              <button
                type="button"
                className={tab === "permissoes" ? "btn primary" : "btn"}
                onClick={() => setTab("permissoes")}
              >
                Permissões
              </button>
            </div>

            {tab === "dados" ? (
              <>
                <Field label="Nome">
                  <input className="input" value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
                </Field>

                <Field label="Email (opcional)">
                  <input className="input" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
                </Field>

                <Field
                  label="Senha"
                  hint="Opcional: defina uma nova senha para o usuário (mínimo 8 caracteres)."
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input
                      className="input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nova senha"
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={onChangePassword}
                      disabled={pwdBusy || saving || removing}
                    >
                      {pwdBusy ? "Atualizando..." : "Atualizar senha"}
                    </button>
                  </div>
                </Field>
              </>
            ) : null}

            {tab === "permissoes" ? (
              <>
                <Field label="Tipo de acesso" hint="Define o que o usuário consegue ver e editar no sistema.">
                  <select className="input" value={form.role || "viewer"} onChange={(e) => set("role", e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="card" style={{ background: "var(--panel)", border: "1px solid var(--border)", marginBottom: 12 }}>
                  <div className="h2" style={{ marginBottom: 6 }}>Resumo das permissões</div>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    <li><b>Admin / Consultor / Designer</b>: edita tudo (imersões, tarefas, materiais, custos, etc.).</li>
                    <li><b>Eventos / Produção / Mentoria / Outros</b>: vê imersões e painel; <b>não vê custos</b> e edita apenas <b>PDCA</b>.</li>
                    <li><b>Visualização</b>: apenas leitura (dashboard + imersões).</li>
                  </ul>
                </div>
              </>
            ) : null}

            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
              Ativo
            </label>

            <div className="row">
              <button type="button" className="btn" onClick={() => router.push("/usuarios")} disabled={saving || removing}>
                Voltar
              </button>

              <button type="button" className="btn danger" onClick={onDelete} disabled={saving || removing}>
                {removing ? "Excluindo..." : "Excluir"}
              </button>

              <button type="submit" className="btn primary" disabled={saving || removing}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </Layout>
  );
}
