import { useState } from "react";
import { useRouter } from "next/router";
import { login } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@sparks.com");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    setError("");
    const res = login(email.trim(), password);
    if (res.ok) router.push("/dashboard");
    else setError(res.message || "Não foi possível entrar.");
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <div style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 16,
        background: "rgba(255,255,255,0.04)",
        color: "#e7ecf5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial"
      }}>
        <h1 style={{ margin: "0 0 10px" }}>Login</h1>

        <p style={{ margin: "0 0 16px", opacity: 0.8 }}>
          Acesso do MVP: <b>admin@sparks.com</b> / <b>123456</b>
        </p>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#e7ecf5",
                outline: "none"
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>Senha</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#e7ecf5",
                outline: "none"
              }}
            />
          </div>

          {error ? (
            <div style={{ marginBottom: 12, color: "#ffb4b4" }}>{error}</div>
          ) : null}

          <button
            type="submit"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#7c5cff",
              color: "white",
              cursor: "pointer"
            }}
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
