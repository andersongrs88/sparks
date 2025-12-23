import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("login"); // login | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Falha no login");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Erro ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(e) {
    e.preventDefault();
    setError("");
    setTempPassword("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao redefinir senha.");
        return;
      }

      setTempPassword(data.tempPassword);
    } catch {
      setError("Erro ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Login">
      <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
        <div className="h2" style={{ marginBottom: 12 }}>
          {mode === "login" ? "Acesso ao sistema" : "Recuperar senha"}
        </div>

        {error ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        {mode === "login" ? (
          <form onSubmit={onLogin}>
            <div className="h2">E-mail</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />

            <div className="h2" style={{ marginTop: 12 }}>
              Senha
            </div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div style={{ marginTop: 16 }} />

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setMode("forgot")}
              >
                Esqueci minha senha
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onResetPassword}>
            <div className="h2">Informe seu e-mail</div>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />

            <div style={{ marginTop: 16 }} />

            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Gerando..." : "Gerar nova senha"}
            </button>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setMode("login")}
              >
                Voltar para login
              </button>
            </div>
          </form>
        )}

        {tempPassword ? (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="h2">Senha temporária</div>
            <div className="small">
              Use esta senha para entrar no sistema:
            </div>
            <div style={{ marginTop: 8, fontWeight: "bold" }}>
              {tempPassword}
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
