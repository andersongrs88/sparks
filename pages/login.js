import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

function friendlyAuthError(err) {
  const raw = (err?.message || "").toLowerCase();

  if (raw.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (raw.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (raw.includes("too many requests") || raw.includes("rate limit"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

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
    return !!hasAuthEnabled && !busy && email.trim().length > 0 && password.length > 0;
  }, [email, password, hasAuthEnabled, busy]);

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

  return (
    <>
      <Head>
        <title>Acesso | Sparks</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="page">
        <div className="shell">
          <div className="brand">
            <div className="logo" aria-hidden="true" />
            <div>
              <div className="title">Acesso</div>
              <div className="subtitle">
                Sparks — Sistema Estratégico de Planejamento e Gestão do Conhecimento
              </div>
            </div>
          </div>

          <div className="card">
            {!hasAuthEnabled ? (
              <div className="alert warn">
                Supabase Auth não está configurado (variáveis <b>NEXT_PUBLIC_SUPABASE_URL</b> /{" "}
                <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>). Configure na Vercel para habilitar login.
              </div>
            ) : null}

            {loading ? (
              <div className="loading">
                <div className="loadingTitle">Verificando sessão…</div>
                <div className="loadingSub">Aguarde um instante.</div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="form">
                <div className="field">
                  <label className="label">E-mail</label>
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
                  <label className="label">Senha</label>
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

                {error ? <div className="alert danger">{error}</div> : null}

                <button className="btn" disabled={!canSubmit}>
                  {busy ? (
                    <span className="btnInner">
                      <span className="spinner" aria-hidden="true" />
                      Entrando…
                    </span>
                  ) : (
                    "Entrar"
                  )}
                </button>

                <div className="hint">
                  Dica: usuários são criados no Supabase (Authentication → Users). Depois ajuste o papel em /usuarios.
                </div>
              </form>
            )}
          </div>

          <div className="footer">Desenvolvido pela Wizze Tecnologia Inteligente</div>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px 16px;
          background:
            radial-gradient(900px 520px at 20% 0%, rgba(90, 140, 255, 0.14), transparent 58%),
            radial-gradient(900px 520px at 92% 18%, rgba(34, 197, 94, 0.12), transparent 58%),
            radial-gradient(700px 500px at 100% 70%, rgba(109, 40, 217, 0.10), transparent 60%),
            #f6f8fc;
        }

        .shell {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 14px;
          text-align: left;
        }

        .logo {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2f6bff 0%, #6d28d9 55%, #111827 120%);
          box-shadow: 0 10px 24px rgba(31, 41, 55, 0.18);
          flex: 0 0 auto;
        }

        .title {
          font-size: 26px;
          font-weight: 760;
          letter-spacing: -0.02em;
          color: #0b1220;
          line-height: 1.1;
        }

        .subtitle {
          margin-top: 4px;
          font-size: 13px;
          color: rgba(11, 18, 32, 0.72);
          line-height: 1.35;
          max-width: 320px;
        }

        .card {
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 16px;
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10);
          padding: 18px;
          backdrop-filter: blur(10px);
        }

        .form {
          display: grid;
          gap: 12px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .label {
          font-size: 12px;
          font-weight: 650;
          color: rgba(11, 18, 32, 0.78);
        }

        .input {
          height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.10);
          background: #ffffff;
          padding: 0 12px;
          font-size: 14px;
          outline: none;
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
        }

        .input:focus {
          border-color: rgba(47, 107, 255, 0.55);
          box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.12);
        }

        .input:disabled {
          background: rgba(2, 6, 23, 0.04);
          cursor: not-allowed;
        }

        .btn {
          margin-top: 2px;
          height: 44px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-weight: 750;
          font-size: 14px;
          color: #fff;
          width: 100%;
          background: linear-gradient(135deg, #2f6bff 0%, #6d28d9 65%, #111827 145%);
          box-shadow: 0 12px 26px rgba(47, 107, 255, 0.18);
          transition: transform 0.06s ease, filter 0.15s ease, opacity 0.15s ease;
        }

        .btn:hover {
          filter: brightness(1.02);
        }

        .btn:active {
          transform: translateY(1px);
        }

        .btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .btnInner {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          justify-content: center;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: rgba(255, 255, 255, 0.95);
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .alert {
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          line-height: 1.35;
          border: 1px solid transparent;
          margin-bottom: 12px;
        }

        .warn {
          background: rgba(245, 158, 11, 0.10);
          border-color: rgba(245, 158, 11, 0.25);
          color: rgba(120, 53, 15, 0.92);
        }

        .danger {
          background: rgba(239, 68, 68, 0.10);
          border-color: rgba(239, 68, 68, 0.25);
          color: rgba(127, 29, 29, 0.92);
        }

        .hint {
          font-size: 12px;
          color: rgba(11, 18, 32, 0.62);
          line-height: 1.35;
          margin-top: 2px;
        }

        .loading {
          padding: 8px 2px;
        }

        .loadingTitle {
          font-size: 14px;
          font-weight: 720;
          color: rgba(11, 18, 32, 0.88);
        }

        .loadingSub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(11, 18, 32, 0.62);
        }

        .footer {
          margin-top: 12px;
          font-size: 12px;
          color: rgba(11, 18, 32, 0.55);
          text-align: center;
        }

        @media (max-width: 420px) {
          .shell {
            max-width: 360px;
          }
          .title {
            font-size: 22px;
          }
          .card {
            padding: 16px;
            border-radius: 14px;
          }
        }
      `}</style>
    </>
  );
}
