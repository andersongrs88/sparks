import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signIn, hasAuthEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user?.id) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err?.message || "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Acesso" hideNav>
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="h1">Acesso ao sistema</div>
        <div className="small" style={{ marginTop: 6 }}>
          Sparks — Sistema Estratégico de Planejamento e Gestão do Conhecimento
        </div>

        {!hasAuthEnabled ? (
          <div className="alert warn" style={{ marginTop: 12 }}>
            Supabase Auth não está configurado (variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
            Configure na Vercel para habilitar login.
          </div>
        ) : null}

        <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <div className="field">
            <div className="label">E-mail</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </div>

          <div className="field">
            <div className="label">Senha</div>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error ? <div className="alert danger" style={{ marginTop: 10 }}>{error}</div> : null}

          <button className="btn primary" disabled={busy || !hasAuthEnabled} style={{ width: "100%", marginTop: 12 }}>
            {busy ? "Entrando..." : "Entrar"}
          </button>

          <div className="small" style={{ marginTop: 12 }}>
            Dica: usuários são criados no Supabase (Authentication → Users). Depois ajuste o papel em /usuarios.
          </div>
        </form>
      </div>
    </Layout>
  );
}
