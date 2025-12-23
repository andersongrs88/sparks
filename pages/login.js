import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { isLoggedIn, loginWithEmailPassword } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!email.trim()) return setError("Digite seu e-mail.");
    if (!password) return setError("Digite sua senha.");

    try {
      setLoading(true);
      await loginWithEmailPassword(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err?.message || "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Login" hideNav>
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <div className="h1">Entrar</div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div className="h2">E-mail</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="h2">Senha</div>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <div className="small" style={{ marginTop: 6 }}>
              A senha é cadastrada na tela de Usuários.
            </div>
          </div>

          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </Layout>
  );
}
