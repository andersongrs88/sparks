import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { deleteProfile, getProfile, updateProfile } from "../../lib/profiles";
import { generatePasswordSuggestion, hashPassword } from "../../lib/auth";

const ROLES = [
  { value: "consultor", label: "Consultor" },
  { value: "designer", label: "Designer" },
  { value: "basico", label: "Básico" },
  { value: "administrador", label: "Administrador" }
];

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "imersoes", label: "Imersões" },
  { key: "usuarios", label: "Usuários" }
];

function normalizeModules(mods) {
  const set = new Set((mods || []).filter(Boolean));
  return Array.from(set);
}

function defaultModulesForRole(role) {
  const r = (role || "").toLowerCase();
  if (r === "administrador") return ["dashboard", "imersoes", "usuarios"];
  return ["dashboard", "imersoes"];
}

export default function EditUserPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(null);

  // senha (opcional)
  const [pwdSuggestion, setPwdSuggestion] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let mounted = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await getProfile(id);
        if (!mounted) return;
        setForm({
          ...data,
          modules: normalizeModules(data.modules || defaultModulesForRole(data.role))
        });
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

  const modulesSet = useMemo(() => new Set(form?.modules || []), [form?.modules]);

  function toggleModule(key) {
    setForm((p) => {
      const cur = new Set(p?.modules || []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...p, modules: Array.from(cur) };
    });
  }

  function setField(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSave(e) {
    e.preventDefault();
    if (!form) return;
    setError("");
    setPwdMsg("");

    if (!form.name?.trim()) return setError("Preencha o nome.");
    if (!form.email?.trim()) return setError("Preencha o e-mail.");

    // senha é opcional (se preencher, valida)
    let password_hash = undefined;
    if (pwd || pwd2) {
      if (!pwd || !pwd2) return setError("Para definir senha, preencha os 2 campos.");
      if (pwd !== pwd2) return setError("As senhas não conferem.");
      if (pwd.length < 8) return setError("Senha muito curta. Use pelo menos 8 caracteres.");
      password_hash = await hashPassword(pwd);
    }

    try {
      setSaving(true);
      await updateProfile(form.id, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        is_active: !!form.is_active,
        modules: normalizeModules(form.modules),
        ...(password_hash ? { password_hash } : {})
      });
      setPwd("");
      setPwd2("");
      setPwdMsg(password_hash ? "Senha atualizada." : "Alterações salvas.");
      alert("Usuário atualizado.");
    } catch (e2) {
      setError(e2?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!form) return;
    const ok = confirm("Excluir este usuário? Essa ação não pode ser desfeita.");
    if (!ok) return;
    try {
      await deleteProfile(form.id);
      router.push("/usuarios");
    } catch (e) {
      setError(e?.message || "Falha ao excluir.");
    }
  }

  function onGeneratePassword() {
    const s = generatePasswordSuggestion(12);
    setPwdSuggestion(s);
    setPwd(s);
    setPwd2(s);
    setPwdMsg("Senha sugerida preenchida. Você pode editar antes de salvar.");
  }

  return (
    <Layout title="Editar usuário">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h2">Editar usuário</div>
        <div className="small">Aqui você ajusta dados, senha (opcional) e permissões dos módulos.</div>
      </div>

      <form className="card" onSubmit={onSave}>
        {loading ? <div className="small">Carregando...</div> : null}
        {error ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        {pwdMsg ? <div className="small" style={{ marginBottom: 12 }}>{pwdMsg}</div> : null}

        {!loading && form ? (
          <>
            <div className="row">
              <div className="col">
                <div className="h2">Nome</div>
                <input className="input" value={form.name || ""} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="col">
                <div className="h2">E-mail</div>
                <input className="input" value={form.email || ""} onChange={(e) => setField("email", e.target.value)} />
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="row">
              <div className="col">
                <div className="h2">Tipo (role)</div>
                <select
                  className="input"
                  value={form.role || "basico"}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    setForm((p) => ({
                      ...p,
                      role: newRole,
                      modules: p.modules?.length ? p.modules : defaultModulesForRole(newRole)
                    }));
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col">
                <div className="h2">Ativo</div>
                <select
                  className="input"
                  value={form.is_active ? "sim" : "nao"}
                  onChange={(e) => setField("is_active", e.target.value === "sim")}
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="h2">Permissões de módulos</div>
              <div className="small" style={{ marginBottom: 10 }}>
                Marque quais telas esse usuário pode acessar.
              </div>

              <div className="row" style={{ gap: 10 }}>
                {MODULES.map((m) => (
                  <label key={m.key} className="btn" style={{ gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={modulesSet.has(m.key)}
                      onChange={() => toggleModule(m.key)}
                      style={{ transform: "scale(1.1)" }}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="topbar" style={{ marginBottom: 10 }}>
                <div>
                  <div className="h2">Senha (opcional)</div>
                  <div className="small">Você pode definir uma senha aqui para o login do sistema.</div>
                </div>
                <button className="btn" type="button" onClick={onGeneratePassword}>
                  Gerar sugestão
                </button>
              </div>

              {pwdSuggestion ? <div className="small">Sugestão: <b>{pwdSuggestion}</b></div> : null}

              <div style={{ height: 10 }} />

              <div className="row">
                <div className="col">
                  <div className="h2">Nova senha</div>
                  <input className="input" type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 8 caracteres" />
                </div>
                <div className="col">
                  <div className="h2">Confirmar senha</div>
                  <input className="input" type="text" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="Repita a senha" />
                </div>
              </div>

              <div className="small" style={{ marginTop: 8 }}>
                Observação: esta é uma solução simples para o MVP. Em produção, o ideal é usar o Supabase Auth para senhas e segurança.
              </div>
            </div>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" type="button" onClick={() => router.push("/usuarios")}>Voltar</button>
              <div className="row">
                <button className="btn danger" type="button" onClick={onDelete}>
                  Excluir
                </button>
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </form>
    </Layout>
  );
}
