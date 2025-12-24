import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AREAS, roleLabel } from "../lib/permissions";
import NotificationsBell from "./NotificationsBell";

function NavLink({ href, children }) {
  const router = useRouter();
  const active = router.pathname === href || (href !== "/" && router.pathname.startsWith(href));
  return (
    <Link href={href} className={active ? "navItem active" : "navItem"}>
      {children}
    </Link>
  );
}

export default function Layout({ title, children }) {
  const { loading, profile, isFullAccess } = useAuth();
  const role = profile?.role;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="shell">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebarHeader">
          <div className="brand">Sparks</div>
          <button type="button" className="btn icon" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            ✕
          </button>
        </div>

        <div className="sidebarMeta">
          <div className="small">{loading ? "Carregando..." : roleLabel(role)}</div>
          <div className="small muted">Acesso livre (MVP)</div>
        </div>

        <nav className="nav">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/imersoes">Imersões</NavLink>
          {(isFullAccess || AREAS.includes(role)) ? <NavLink href="/painel">Painel</NavLink> : null}
          {isFullAccess ? <NavLink href="/usuarios">Usuários</NavLink> : null}
          {isFullAccess ? <NavLink href="/configuracoes/templates">Configurações</NavLink> : null}
          <NavLink href="/notificacoes">Notificações</NavLink>
        </nav>
      </aside>

      <div className="main">
        <header className="header">
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn icon" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
              ☰
            </button>
            <div>
              <div className="pageTitle">{title || "Sistema de Imersões"}</div>
              <div className="small muted">
                Planejamento, execução e controle com base no Educagrama
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <NotificationsBell />
          </div>
        </header>

        <main className="content">
          {children}
        </main>
      </div>

      {mobileOpen ? <div className="backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
    </div>
  );
}
