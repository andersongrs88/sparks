import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { getSession, hasModule, logout } from "../lib/auth";
import { APP_VERSION } from "../lib/version";

export default function Layout({ title, children }) {
  const router = useRouter();
  const [session, setSession] = useState(null);

  useEffect(() => {
    const s = getSession();
    setSession(s);

    // proteção simples (MVP)
    if (!s && router.pathname !== "/login") {
      router.replace("/login");
      return;
    }

    // bloqueio por módulo (MVP)
    const path = router.pathname || "";
    if (path.startsWith("/usuarios") && !hasModule(s, "usuarios")) {
      router.replace("/dashboard");
      return;
    }
    if (path.startsWith("/imersoes") && !hasModule(s, "imersoes")) {
      router.replace("/dashboard");
    }
  }, [router.pathname]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <div className="h1">{title}</div>
          <div className="small">Sparks • Sistema de Administração de Imersões</div>
        </div>

        <div className="nav">
          {hasModule(session, "dashboard") ? (
            <Link href="/dashboard" className="btn">Dashboard</Link>
          ) : null}
          {hasModule(session, "imersoes") ? (
            <Link href="/imersoes" className="btn">Imersões</Link>
          ) : null}
          {hasModule(session, "usuarios") ? (
            <Link href="/usuarios" className="btn">Usuários</Link>
          ) : null}
          <button className="btn danger" onClick={handleLogout}>Sair</button>
        </div>
      </div>

      {children}
  <div style={{ marginTop: 16, textAlign: "center" }} className="small">
  Versão: <b>{APP_VERSION}</b>
</div>

    </div>
  );
}

