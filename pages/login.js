import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

function friendlyAuthError(err) {
  const raw = (err?.message || "").toLowerCase();

  if (raw.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (raw.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (raw.includes("too many requests") || raw.includes("rate limit"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

  return err?.message || "Não foi possível entrar. Tente novamente.";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, hasAuthEnabled } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);

  const errorRef = useRef(null);

  const canSubmit = useMemo(() => {
    return (
      !!hasAuthEnabled &&
      !busy &&
      email.trim().length > 0 &&
      password.length >= 1
    );
  }, [email, password, hasAuthEnabled, busy]);

  // Se já estiver logado, não mostra login
  useEffect(() => {
    if (!loading && user?.id) router.replace("/dashboard");
  }, [loading, user, router]);

  // Quando houver erro, leva foco para a mensagem (acessibilidade)
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");

    try {
      // Observação: "remember" aqui é UX; o comportamento real depende do seu AuthContext/Supabase.
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
        <title>Acesso | Sparks by Educagrama</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="page">
        <div className="wrap" aria-label="Página de acesso ao sistema">
          {/* Painel esquerdo (desktop) */}
          <aside className="panel" aria-hidden="true">
            <div className="panelInner">
              <div className="brand">
                <div className="mark" />
                <div className="brandText">
                  <div className="brandTitle"></div>
                  <div className="brandSub">
                    Sistema Inteligente de Planejamento e Gestão do Conhecimento
                  </div>
                </div>
              </div>

              <div className="headline">
                Planejamento, execução e controle em um só lugar.
              </div>

              <ul className="bullets">
                <li>
                  <span className="dot" />
                  Acesso seguro com perfis e permissões
                </li>
                <li>
                  <span className="dot" />
                  Operação fluida no navegador e no mobile
                </li>
                <li>
                  <span className="dot" />
                  Interface objetiva para rotina de execução
                </li>
              </ul>

              <div className="panelFoot">
                <div className="tinyMuted">
                  Dica: Cadê seu analista Senhor(a)?.
                </div>
              </div>
            </div>
          </aside>

          {/* Card de login */}
          <main className="card" aria-label="Formulário de login">
            <div className="cardHead">
              <div className="cardTitle">Acesso</div>
              <div className="cardSub">
                Entre para continuar.
              </div>
            </div>

            {!hasAuthEnabled ? (
              <div className="alert warn" role="status" aria-live="polite">
                Supabase Auth não está configurado. Defina as variáveis{" "}
                <strong>NEXT_PUBLIC_SUPABASE_URL</strong> e{" "}
                <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> na Vercel.
              </div>
            ) : null}

            {loading ? (
              <div className="skeleton" role="status" aria-live="polite">
                <div className="skLine skTitle" />
                <div className="skLine" />
                <div className="skLine" />
                <div className="skBtn" />
              </div>
            ) : (
              <form onSubmit={onSubmit} className="form">
                <div className="field">
                  <label className="label" htmlFor="email">
                    E-mail
                  </label>
                  <input
                    id="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
                    inputMode="email"
                    disabled={busy}
                    aria-invalid={!!error}
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="password">
                    Senha
                  </label>

                  <div className="passRow">
                    <input
                      id="password"
                      className="input"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={busy}
                      aria-invalid={!!error}
                    />

                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPass((v) => !v)}
                      disabled={busy}
                      aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                      title={showPass ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPass ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div
                    className="alert danger"
                    role="alert"
                    tabIndex={-1}
                    ref={errorRef}
                  >
                    {error}
                  </div>
                ) : null}

                <div className="row">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      disabled={busy}
                    />
                    <span>Manter conectado</span>
                  </label>

                  {/* Link placeholder (se você não tiver rota, pode remover) */}
                  <Link className="link" href="/esqueci-minha-senha">
                    Esqueci minha senha
                  </Link>
                </div>

                <button className="btn" disabled={!canSubmit} type="submit">
                  {busy ? (
                    <span className="btnInner">
                      <span className="spinner" aria-hidden="true" />
                      Entrando…
                    </span>
                  ) : (
                    "Entrar"
                  )}
                </button>

                <div className="legal">
                  Ao entrar, você concorda com o uso interno do sistema conforme as políticas da organização.
                </div>
              </form>
            )}

<div className="footer" style={{ textAlign: "center" }}> ® Desenvolvido pela Wizze Tecnologia Inteligente </div>
          </main>
        </div>
      </div>

      <style jsx>{`
        :global(html, body) {
          height: 100%;
        }

        /* Base premium + acessível */
        .page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px 14px;
          background:
            radial-gradient(900px 520px at 20% 0%, rgba(90, 140, 255, 0.16), transparent 58%),
            radial-gradient(900px 520px at 92% 18%, rgba(34, 197, 94, 0.13), transparent 58%),
            radial-gradient(700px 500px at 100% 70%, rgba(109, 40, 217, 0.10), transparent 60%),
            #f6f8fc;
        }

        /* Container responsivo (desktop: 2 colunas; mobile: 1 coluna) */
        .wrap {
          width: 100%;
          max-width: 980px;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 18px;
          align-items: stretch;
        }

        /* Painel esquerdo (desktop) */
        .panel {
          border-radius: 18px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.60);
          backdrop-filter: blur(10px);
          box-shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
          overflow: hidden;
          position: relative;
        }

        .panel::before {
          content: "";
          position: absolute;
          inset: -120px -120px auto auto;
          width: 280px;
          height: 280px;
          background: radial-gradient(circle at 30% 30%, rgba(47, 107, 255, 0.22), transparent 55%);
          filter: blur(2px);
          pointer-events: none;
        }

        .panelInner {
          height: 100%;
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .mark {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: linear-gradient(135deg, #2f6bff 0%, #6d28d9 60%, #111827 140%);
          box-shadow: 0 12px 24px rgba(31, 41, 55, 0.18);
          flex: 0 0 auto;
        }

        .brandTitle {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0b1220;
          line-height: 1.1;
        }

        .brandSub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(11, 18, 32, 0.70);
          line-height: 1.35;
          max-width: 360px;
        }

        .headline {
          margin-top: 6px;
          font-size: 20px;
          font-weight: 760;
          letter-spacing: -0.02em;
          color: #0b1220;
          line-height: 1.2;
          max-width: 420px;
        }

        .bullets {
          list-style: none;
          padding: 0;
          margin: 6px 0 0;
          display: grid;
          gap: 10px;
          color: rgba(11, 18, 32, 0.78);
          font-size: 13px;
          line-height: 1.35;
        }

        .bullets li {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(47, 107, 255, 0.9);
          margin-top: 4px;
          flex: 0 0 auto;
          box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.12);
        }

        .panelFoot {
          margin-top: auto;
          padding-top: 10px;
          border-top: 1px solid rgba(15, 23, 42, 0.08);
        }

        .tinyMuted {
          font-size: 12px;
          color: rgba(11, 18, 32, 0.62);
          line-height: 1.35;
        }

        /* Card login */
        .card {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(15, 23, 42, 0.10);
          box-shadow: 0 20px 70px rgba(15, 23, 42, 0.12);
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .cardHead {
          margin-bottom: 12px;
        }

        .cardTitle {
          font-size: 22px;
          font-weight: 820;
          letter-spacing: -0.02em;
          color: #0b1220;
        }

        .cardSub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(11, 18, 32, 0.70);
          line-height: 1.35;
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
          font-weight: 700;
          color: rgba(11, 18, 32, 0.78);
        }

        .input {
          height: 46px;
          border-radius: 12px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: #fff;
          padding: 0 12px;
          font-size: 14px;
          outline: none;
          transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
        }

        .input:focus {
          border-color: rgba(47, 107, 255, 0.65);
          box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.14);
        }

        .input:disabled {
          background: rgba(2, 6, 23, 0.04);
          cursor: not-allowed;
        }

        .passRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
        }

        .ghost {
          height: 46px;
          border-radius: 12px;
          padding: 0 12px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255, 255, 255, 0.65);
          cursor: pointer;
          font-weight: 750;
          font-size: 13px;
          color: rgba(11, 18, 32, 0.78);
          transition: background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }

        .ghost:hover {
          background: rgba(255, 255, 255, 0.95);
        }

        .ghost:focus {
          outline: none;
          border-color: rgba(47, 107, 255, 0.65);
          box-shadow: 0 0 0 4px rgba(47, 107, 255, 0.14);
        }

        .row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-top: 2px;
        }

        .check {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: rgba(11, 18, 32, 0.75);
          user-select: none;
        }

        .check input {
          width: 16px;
          height: 16px;
        }

        .link {
          font-size: 13px;
          font-weight: 750;
          color: rgba(47, 107, 255, 0.92);
          text-decoration: none;
        }

        .link:hover {
          text-decoration: underline;
        }

        .btn {
          margin-top: 6px;
          height: 46px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-weight: 820;
          font-size: 14px;
          color: #fff;
          width: 100%;
          background: linear-gradient(135deg, #2f6bff 0%, #6d28d9 65%, #111827 145%);
          box-shadow: 0 14px 30px rgba(47, 107, 255, 0.18);
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

        .legal {
          font-size: 12px;
          color: rgba(11, 18, 32, 0.58);
          line-height: 1.35;
          margin-top: 2px;
        }

        .footer {
          margin-top: 14px;
          font-size: 12px;
          color: rgba(11, 18, 32, 0.55);
          text-align: center;
        }

        /* Skeleton simples (qualidade percebida) */
        .skeleton {
          display: grid;
          gap: 10px;
          padding: 8px 0;
        }
        .skLine,
        .skBtn {
          border-radius: 12px;
          background: linear-gradient(
            90deg,
            rgba(15, 23, 42, 0.06),
            rgba(15, 23, 42, 0.10),
            rgba(15, 23, 42, 0.06)
          );
          background-size: 200% 100%;
          animation: shimmer 1.1s linear infinite;
        }
        .skTitle {
          height: 16px;
          width: 55%;
          border-radius: 10px;
        }
        .skLine {
          height: 46px;
        }
        .skBtn {
          height: 46px;
          margin-top: 6px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* Preferências de acessibilidade */
        @media (prefers-reduced-motion: reduce) {
          .spinner, .skLine, .skBtn {
            animation: none;
          }
          .btn, .input, .ghost {
            transition: none;
          }
        }

        /* Mobile: vira 1 coluna e reduz “ruído” */
        @media (max-width: 860px) {
          .wrap {
            grid-template-columns: 1fr;
            max-width: 520px;
          }
          .panel {
            display: none;
          }
          .card {
            padding: 16px;
          }
        }

        @media (max-width: 420px) {
          .page {
            padding: 16px 12px;
          }
          .cardTitle {
            font-size: 20px;
          }
          .passRow {
            grid-template-columns: 1fr;
          }
          .ghost {
            width: 100%;
          }
          .row {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
        }
      `}</style>
    </>
  );
}
