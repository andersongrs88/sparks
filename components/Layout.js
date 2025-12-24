import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../lib/permissions";
import NotificationsBell from "./NotificationsBell";

function NavItem({ href, label, icon }) {
  const router = useRouter();
  const active = router.pathname === href || (href !== "/" && router.pathname.startsWith(href));
  return (
    <Link href={href} className={active ? "navItem active" : "navItem"} aria-current={active ? "page" : undefined}>
      <span className="navIcon" aria-hidden="true">{icon}</span>
      <span className="navLabel">{label}</span>
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const initial = saved || "dark";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("theme", next); } catch {}
  }

  return (
    <button type="button" className="btn icon" onClick={toggle} aria-label={theme === "dark" ? "Alternar para tema claro" : "Alternar para tema escuro"}>
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}

export default function Layout({ title, children }) {
  const { loading, profile, isFullAccess } = useAuth();
  const role = profile?.role;
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = useMemo(() => title || "Sistema de Imersões", [title]);

  return (
    <div className="shell">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebarHeader">
          <div className="brand">Sparks</div>
          <button type="button" className="btn icon mobileOnly" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            ✕
          </button>
        </div>

        <div className="sidebarMeta">
          <div className="small">{loading ? "Carregando..." : roleLabel(role)}</div>
          <div className="small muted">Acesso livre (MVP)</div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          <NavItem href="/dashboard" label="Dashboard" icon="▦" />
          <NavItem href="/imersoes" label="Imersões" icon="📅" />
          <NavItem href="/checklists" label="Cadastrar checklist" icon="🗂" />
          <NavItem href="/painel" label="Plano de Ação" icon="✅" />
          <NavItem href="/relatorios" label="Relatórios" icon="📊" />
          {isFullAccess ? <NavItem href="/usuarios" label="Usuários" icon="👤" /> : null}
          <NavItem href="/notificacoes" label="Notificações" icon="🔔" />
        </nav>
      </aside>

      <div className="main">
        <header className="header">
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn icon mobileOnly" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
              ☰
            </button>
            <div>
              <div className="pageTitle">{pageTitle}</div>
              <div className="small muted">Planejamento, execução e controle com base no Educagrama</div>
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      {mobileOpen ? <div className="backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
    </div>
  );
}
