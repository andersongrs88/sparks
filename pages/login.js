import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("admin@exemplo.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Falha no login.");
        setLoading(false);
        return;
      }

      // ✅ salva sessão simples
      localStorage.setItem("sparks_user", JSON.stringify(data.user));

      // ✅ redireciona (replace evita voltar pra tela de login)
      router.replace("/dashboard");
    } catch (err) {
      setMsg("Erro ao conectar.");
      setLoading(false);
    }
  }

  function onForgot() {
    router.push("/reset-password");
  }

  return (
    <Layout title="Login">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="h1" style={{ marginBottom: 8 }}>Acesso ao sistema</div>

        {msg ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{msg}</div> : null}

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div className="h2">E-mail</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="h2">Senha</div>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div className="row">
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button className="btn" type="button" onClick={onForgot} disabled={loading}>
              Esqueci minha senha
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
