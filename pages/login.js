import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { loading, user, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await signIn(email.trim(), password);
      router.push("/dashboard");
    } catch (e) {
      setError(e?.message || "Não foi possível entrar.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0f1a" }}>
      <div style={{ width: 420, background: "#121a2b", padding: 24, borderRadius: 12, color: "white" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Acesso ao sistema</h1>
        <p style={{ opacity: 0.85, marginTop: 8 }}>Entre com seu e-mail e senha (Supabase Auth).</p>

        {error ? (
          <div style={{ background: "#3a1c1c", border: "1px solid #ff6b6b", padding: 10, borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, opacity: 0.9 }}>E-mail</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@empresa.com"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a3551", background: "#0f1626", color: "white" }}
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, opacity: 0.9 }}>Senha</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2a3551", background: "#0f1626", color: "white" }}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#7c5cff",
              color: "white",
              cursor: "pointer",
              opacity: loading ? 0.7 : 1
            }}
          >
            Entrar
          </button>
        </form>

        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
          Dica: os usuários precisam existir no Supabase (Authentication → Users) e ter perfil na tabela <b>profiles</b> com role.
        </div>
      </div>
    </div>
  );
}
