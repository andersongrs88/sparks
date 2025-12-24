import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { AREAS, roleLabel } from "../lib/permissions";
import NotificationsBell from "./NotificationsBell";

export default function Layout({ title, children }) {
  const router = useRouter();
  const { loading, user, profile, isFullAccess } = useAuth();
  const role = profile?.role;

  // Autenticação removida: não há logout.

  return (
    <div>
      <div className="topbar">
        <div className="container topbarInner">
          <div>
            <div className="appTitle">{title || "Sparks MVP"}</div>
            <div className="subTitle">
              {loading
                ? "Carregando..."
                : `Acesso livre (sem login) • ${roleLabel(profile?.role)}`}
            </div>
          </div>

          <div className="nav">
            <Link href="/dashboard" className="btn">Dashboard</Link>
            <Link href="/imersoes" className="btn">Imersões</Link>
            {(isFullAccess || AREAS.includes(role)) ? <Link href="/painel" className="btn">Painel</Link> : null}
            {isFullAccess ? <Link href="/usuarios" className="btn">Usuários</Link> : null}
            {isFullAccess ? <Link href="/configuracoes/templates" className="btn">Configurações</Link> : null}
            <NotificationsBell />
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
