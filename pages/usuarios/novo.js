import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "consultor_educacao", label: "Consultor (Educação)" },
  { value: "designer", label: "Designer Instrucional" },
  { value: "eventos", label: "Eventos (edita PDCA)" },
  { value: "producao", label: "Produção (edita PDCA)" },
  { value: "mentoria", label: "Mentoria (edita PDCA)" },
  { value: "outros", label: "Outros (edita PDCA)" },
  { value: "viewer", label: "Somente visualização" }
];

function genPassword() {
  // 12 chars, com mix básico (boa usabilidade + segurança suficiente para senha temporária)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function NovoUsuario() {
  const router = useRouter();
  const { loading: authLoading, user, profile, isFullAccess, hasAuthEnabled } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  const canCreate = useMemo(() => {
    // Regra de negócio: apenas ADMIN cria usuários
    return !!user && (profile?.role === "admin" || user?.id === "noauth");
  }, [user, profile]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!hasAuthEnabled) {
      setError("Supabase Auth não está habilitado neste ambiente. Configure as variáveis e o Auth no Supabase.");
      return;
    }
    if (!canCreate) {
      setError("Apenas ADMIN pode criar usuários.");
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName) return setError("Informe o nome.");
    if (!cleanEmail) return setError("Informe o e-mail.");
    if (!password || password.length < 8) return setError("Informe uma senha (mínimo 8 caracteres).");

    try {
      setSubmitting(true);

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const r = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          password,
          role,
          is_active: isActive
        })
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Falha ao criar usuário.");

      setSuccess("Usuário criado com sucesso.");
      const id = j?.id;
      if (id) {
        // Redireciona para edição (onde você pode ativar/desativar/ajustar role futuramente)
        router.push(`/usuarios/${id}`);
      } else {
        router.push("/usuarios");
      }
    } catch (err) {
      setError(err?.message || "Falha ao criar usuário.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Novo usuário">
      <div className="card">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <div className="h2">Novo usuário</div>
            <div className="small">Crie um usuário e defina o nível de acesso (role).</div>
          </div>

          <button className="btn" type="button" onClick={() => router.push("/usuarios")}>Voltar</button>
        </div>

        {!canCreate ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>
            Apenas perfis <b>Administrador</b> podem criar novos usuários.
          </div>
        ) : null}

        {!hasAuthEnabled ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>
            Supabase Auth não está habilitado neste ambiente.
          </div>
        ) : null}

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}
        {success ? <div className="small" style={{ color: "var(--success)", marginBottom: 12 }}>{success}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <div className="label">Nome</div>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Anderson Cabral"
                autoComplete="name"
                required
              />
            </label>

            <label className="field">
              <div className="label">E-mail</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@dominio.com"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>

            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span>Senha</span>
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => setPassword(genPassword())}
                  aria-label="Gerar senha temporária"
                >
                  Gerar senha
                </button>
              </div>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                required
              />
              <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                Dica: use uma senha temporária e peça para o usuário alterar depois.
              </div>
            </label>

            <label className="field">
              <div className="label">Tipo (Permissão)</div>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 26 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="label" style={{ margin: 0 }}>Usuário ativo</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn primary" type="submit" disabled={submitting || !canCreate || !hasAuthEnabled}>
              {submitting ? "Criando..." : "Criar usuário"}
            </button>
            <button className="btn" type="button" onClick={() => router.push("/usuarios")}>Cancelar</button>
          </div>
        </form>

        <div className="small" style={{ marginTop: 14, opacity: 0.85 }}>
          Observação: esta tela usa um endpoint server-side com <b>SERVICE ROLE KEY</b>. Configure a variável
          <b> SUPABASE_SERVICE_ROLE_KEY</b> na Vercel (Environment Variables) para habilitar criação de usuários.
        </div>
      </div>

      <style jsx>{`
        /* Mobile-first: evita 2 colunas estourarem em telas pequenas */
        @media (max-width: 720px) {
          .grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </Layout>
  );
}
