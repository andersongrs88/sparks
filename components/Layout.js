import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { AREAS, roleLabel } from "../lib/permissions";
import NotificationsBell from "./NotificationsBell";

export default function Layout({ title, children }) {
  const router = useRouter();
  const { loading, user, profile, isFullAccess, signOut } = useAuth();
  const role = profile?.role;

  async function onLogout() {
    try {
      await signOut();
    } catch (e) {
      console.error(e);
    } finally {
      router.push("/login");
    }
  }

  return (
    <div>
      <div className="topbar">
        <div className="container topbarInner">
          <div>
            <div className="appTitle">{title || "Sparks MVP"}</div>
            <div className="subTitle">
              {loading ? "Carregando..." : user ? (
                <>
                  {roleLabel(profile?.role)} • {profile?.email || user.email}
                </>
              ) : "Desconectado"}
            </div>
          </div>

          <div className="nav">
            <Link href="/dashboard" className="btn">Dashboard</Link>
            <Link href="/imersoes" className="btn">Imersões</Link>
            {(isFullAccess || AREAS.includes(role)) ? <Link href="/painel" className="btn">Painel</Link> : null}
            {isFullAccess ? <Link href="/usuarios" className="btn">Usuários</Link> : null}
            {isFullAccess ? <Link href="/configuracoes/templates" className="btn">Configurações</Link> : null}
            <NotificationsBell />
            <button className="btn danger" onClick={onLogout}>Sair</button>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
