import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

function friendlyAuthError(err) {
  const msg = (err?.message || "").toLowerCase();

  // Mensagens comuns do Supabase/Auth
  if (msg.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("user not found")) return "Usuário não encontrado.";
  if (msg.includes("password") && msg.includes("short")) return "Sua senha é muito curta.";
  if (msg.includes("rate limit") || msg.includes("too many requests"))
    return "Muitas tentativas. Aguarde um pouco e tente novamente.";

  return err?.message || "Falha ao entrar.";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, hasAuthEnabled } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    const e = email.trim();
    return !!hasAuthEnabled && !busy && e.length > 0 && password.length > 0;
  }, [email, password, hasAuthEnabled, busy]);

  // Proteção: se já está logado, não deixa ver o /login
  useEffect(() => {
    if (!loading && user?.id) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");

    try {
      await signIn(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  // Enquanto valida sessão, evita flicker e “piscada” de layout
  if (loading) {
    return (
      <>
        <Head>
          <title>Acesso | Sparks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <div className="min-h-screen w-full flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="card">
              <div className="h1">Carregando…</div>
              <div className="small" style={{ marginTop: 8 }}>
                Verificando sessão.
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Acesso | Sparks</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Página “limpa” para login (sem Layout), com centralização correta */}
      <div className="min-h-screen w-full flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header fora do card dá aparência mais profissional */}
          <div style={{ marginBottom: 12 }}>
            <div className="h1" style={{ marginBottom: 6 }}>
              Acesso
            </div>
            <div className="small">
              Sparks — Sistema Estratégico de Planejamento e Gestão do Conhecimento
            </div>
          </div>

          <div className="card">
            {!hasAuthEnabled ? (
              <div className="alert warn">
                Supabase Auth não está configurado (variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
                Configure na Vercel para habilitar login.
              </div>
            ) : null}

            <form onSubmit={onSubmit} style={{ marginTop: hasAuthEnabled ? 0 : 14 }}>
              <div className="field">
                <div className="label">E-mail</div>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  inputMode="email"
                  disabled={busy}
                />
              </div>

              <div className="field">
                <div className="label">Senha</div>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={busy}
                />
              </div>

              {error ? (
                <div className="alert danger" style={{ marginTop: 10 }}>
                  {error}
                </div>
              ) : null}

              <button
                className="btn primary"
                disabled={!canSubmit}
                style={{ width: "100%", marginTop: 12, opacity: canSubmit ? 1 : 0.7 }}
              >
                {busy ? "Entrando..." : "Entrar"}
              </button>

              {/* Ajuda e dicas em área separada (melhor leitura) */}
              <div className="small" style={{ marginTop: 12, lineHeight: 1.4 }}>
                Dica: usuários são criados no Supabase (Authentication → Users). Depois ajuste o papel em /usuarios.
              </div>
            </form>
          </div>

          {/* Footer discreto */}
          <div className="small" style={{ marginTop: 12, opacity: 0.8 }}>
            Desenvolvido pela Wizze Tecnologia Inteligente
          </div>
        </div>
      </div>
    </>
  );
}
