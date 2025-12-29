import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { deleteProfile, getProfile, setUserPassword, updateProfile } from "../../lib/profiles";

const ROLE_PRESETS = [
  // Mantemos ADMIN por segurança (gestão total).
  { key: "admin", label: "Administrador" },

  // Lista solicitada
  { key: "consultor_educacao", label: "Consultor" },
  { key: "designer", label: "Designer" },
  { key: "producao", label: "Produção" },
  { key: "eventos", label: "Eventos" },
  { key: "tecnica", label: "Técnica" },
  { key: "mentoria", label: "Mentoria" },
  { key: "viewer", label: "Visualização" }
];

const PERMISSIONS = [
  { key: "view_dashboard", label: "Ver Dashboard" },
  { key: "view_immersoes", label: "Ver Imersões" },
  { key: "view_painel", label: "Ver Plano de Ação" },
  { key: "view_relatorios", label: "Ver Relatórios" },
  { key: "view_templates", label: "Ver Templates" },
  { key: "view_palestrantes", label: "Ver Palestrantes" },
  { key: "view_usuarios", label: "Ver Usuários" },

  { key: "edit_immersoes", label: "Editar Imersões" },
  { key: "edit_tasks", label: "Editar Tarefas" },
  { key: "edit_pdca", label: "Editar PDCA" },
  { key: "view_costs", label: "Ver Custos" },
  { key: "edit_costs", label: "Editar Custos" },
  { key: "manage_users", label: "Gerenciar Usuários" }
];

function presetPermissions(roleKey) {
  const base = {
    view_dashboard: true,
    view_immersoes: true,
    view_painel: true,
    view_relatorios: true,
    view_templates: false,
    view_palestrantes: true,
    view_usuarios: false,
    edit_immersoes: false,
    edit_tasks: false,
    edit_pdca: false,
    view_costs: false,
    edit_costs: false,
    manage_users: false
  };

  const r = String(roleKey || "viewer");

  if (r === "viewer") {
    return { ...base, view_painel: false, view_relatorios: false };
  }

  // Operacional: vê (quase) tudo, edita apenas PDCA.
  if (r === "producao" || r === "eventos" || r === "tecnica" || r === "mentoria") {
    return { ...base, edit_pdca: true, view_templates: false, view_usuarios: false, view_costs: false, edit_costs: false };
  }

  // Semi-admin: edita tudo (menos usuários)
  if (r === "consultor_educacao" || r === "consultor" || r === "designer") {
    return {
      ...base,
      view_templates: true,
      edit_immersoes: true,
      edit_tasks: true,
      edit_pdca: true,
      view_costs: true,
      edit_costs: true
    };
  }

  // Admin
  if (r === "admin") {
    return {
      ...base,
      view_templates: true,
      view_usuarios: true,
      edit_immersoes: true,
      edit_tasks: true,
      edit_pdca: true,
      view_costs: true,
      edit_costs: true,
      manage_users: true
    };
  }

  return base;
}

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
  const [permCustom, setPermCustom] = useState(false);

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
        if (mounted) {
          // Garante que sempre exista um objeto de permissões para a UI.
          const roleKey = data?.role || "viewer";
          const perms = data?.permissions && typeof data.permissions === "object" ? data.permissions : presetPermissions(roleKey);
          setPermCustom(!!data?.permissions);
          setForm({ ...data, role: roleKey, permissions: perms });
        }
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

  function setPerm(key, value) {
    setForm((p) => ({ ...p, permissions: { ...(p?.permissions || {}), [key]: !!value } }));
    setPermCustom(true);
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
      const saved = await updateProfile(form.id, {
        name: form.name.trim(),
        email: (form.email || "").trim() || null,
        role: form.role || "viewer",
        // Personalizado: salva objeto. Preset: envia null para limpar "override" e deixar o role governar.
        permissions: permCustom ? (form.permissions || presetPermissions(form.role)) : null,
        is_active: !!form.is_active
      });

      // Usa retorno do servidor (evita qualquer inconsistência) e recalcula permissões da UI
      const refreshed = saved || (await getProfile(form.id));
      const roleKey = refreshed?.role || (form.role || "viewer");
      const perms = refreshed?.permissions && typeof refreshed.permissions === "object"
        ? refreshed.permissions
        : presetPermissions(roleKey);
      setPermCustom(!!refreshed?.permissions);
      setForm({ ...refreshed, role: roleKey, permissions: perms });

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
      const out = await setUserPassword(form.id, pwd);
      setNewPassword("");
      if (out?.new_id && out.new_id !== form.id) {
        alert("Senha atualizada. Este usuário ganhou login e foi migrado. Você será redirecionado.");
        router.replace(`/usuarios/${out.new_id}`);
        return;
      }
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
                <Field
                  label="Perfil"
                  hint="Selecione um perfil-base. Você pode personalizar as permissões abaixo e salvar do mesmo jeito."
                >
                  <select
                    className="input"
                    value={form.role || "viewer"}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      setForm((p) => ({ ...p, role: nextRole, permissions: presetPermissions(nextRole) }));
                      setPermCustom(false);
                    }}
                  >
                    {ROLE_PRESETS.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="card" style={{ background: "var(--panel)", border: "1px solid var(--border)", marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="h2" style={{ marginBottom: 4 }}>Permissões</div>
                      <div className="small">Marque/desmarque para criar um acesso personalizado.</div>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          const roleKey = form.role || "viewer";
                          setForm((p) => ({ ...p, permissions: presetPermissions(roleKey) }));
                          setPermCustom(false);
                        }}
                        disabled={saving || removing}
                      >
                        Restaurar padrão
                      </button>
                      <span className="pill" title="Indica se você personalizou os checkboxes">
                        {permCustom ? "Personalizado" : "Padrão"}
                      </span>
                    </div>
                  </div>

                  <div className="grid2" style={{ gap: 10 }}>
                    {PERMISSIONS.map((perm) => (
                      <label key={perm.key} className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!(form.permissions || {})[perm.key]}
                          onChange={(e) => setPerm(perm.key, e.target.checked)}
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="small" style={{ marginBottom: 12 }}>
                  Observação: o sistema continua utilizando o <b>perfil</b> como base de filtragem de listas (ex.: Consultor/Designer/Produção/Eventos).
                  As permissões personalizadas refinam o acesso e podem evoluir junto das próximas telas.
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