import Link from "next/link";
import { useRouter } from "next/router";
import { logout } from "../lib/auth";

export default function Layout({ title, children }) {
  const router = useRouter();

  function onLogout() {
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
<Link href="/dashboard" className="btn">Dashboard</Link>
<Link href="/imersoes" className="btn">Imersões</Link>
<Link href="/usuarios" className="btn">Usuários</Link>
<button className="btn danger" onClick={onLogout}>Sair</button>        </div>
      </div>

      {children}
    </div>
  );
}


