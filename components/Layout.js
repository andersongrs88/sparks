import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { canSeeMenuItem, roleLabel } from "../lib/permissions";
// Notificações removidas por opção de produto (tela não utilizada).

const SYSTEM_FULL_NAME = "Sistema Inteligente de Planejamento e Gestão do Conhecimento";
const DEVELOPED_BY = "Desenvolvido pela Wizze Tecnologia Inteligente";

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

export default function Layout({ title, children, hideNav = false }) {
  const { loading, profile, isFullAccess, user, signOutFast } = useAuth();
  const router = useRouter();
  const role = profile?.role;
  const displayName = useMemo(() => {
    // Preferência: nome do profile (quando existe). Fallback: parte antes do @ no email.
    const rawName = profile?.name;
    if (rawName && String(rawName).trim()) return String(rawName).trim();

    const email = profile?.email || user?.email || "";
    if (!email) return "";
    return String(email).split("@")[0] || "";
  }, [profile?.name, profile?.email, user?.email]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const pageTitle = useMemo(() => title || "Sparks", [title]);
  
const documentTitle = useMemo(() => {
    // Discreto: mantém o nome completo do sistema no título do navegador,
    // sem poluir a UI de cada tela.
    return `${pageTitle} | ${SYSTEM_FULL_NAME}`;
  }, [pageTitle]);

  // Tema único (claro) para eliminar inconsistências e bugs de alternância.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = "light";
    try {
      window.localStorage?.setItem("theme", "light");
    } catch (_) {}
  }, []);

  return (
    <div className="shell">
      <Head>
        <title>{documentTitle}</title>
        <meta name="application-name" content={SYSTEM_FULL_NAME} />
      </Head>
      {!hideNav ? (

        <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="sidebarHeader">
          <div>
            <div className="brand">Sparks</div>
            <div> by Educagrama</div>
            <div className="brandSub muted" aria-label={SYSTEM_FULL_NAME}>{SYSTEM_FULL_NAME}</div>
          </div>
          <button type="button" className="btn icon mobileOnly" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            ✕
          </button>
        </div>

        <div className="sidebarMeta">
          <div className="small">{loading ? "Carregando..." : roleLabel(role)}</div>
          <div className="small muted">{loading ? "" : displayName}</div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {canSeeMenuItem(role, "dashboard") ? <NavItem href="/dashboard" label="Dashboard" icon="▦" /> : null}
          {canSeeMenuItem(role, "imersoes") ? <NavItem href="/imersoes" label="Imersões" icon="📅" /> : null}
          {canSeeMenuItem(role, "painel") ? <NavItem href="/painel" label="Plano de Ação" icon="✅" /> : null}
          {canSeeMenuItem(role, "relatorios") ? <NavItem href="/relatorios" label="Relatórios" icon="📊" /> : null}
          {canSeeMenuItem(role, "templates") ? <NavItem href="/configuracoes/templates" label="Templates" icon="🧩" /> : null}
          {canSeeMenuItem(role, "notificacoes_email") ? <NavItem href="/configuracoes/notificacoes-email" label="Notificações (E-mail)" icon="✉️" /> : null}
          {canSeeMenuItem(role, "palestrantes") ? <NavItem href="/palestrantes" label="Palestrantes" icon="🎤" /> : null}
          {canSeeMenuItem(role, "usuarios") ? <NavItem href="/usuarios" label="Usuários" icon="👤" /> : null}
          {/* Sempre disponível para usuários logados */}
          {user?.id && user.id !== "noauth" ? <NavItem href="/conta" label="Minha conta" icon="⚙" /> : null}
        </nav>

        {!hideNav && user?.id && user.id !== "noauth" ? (
          <div style={{ padding: 12 }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                if (signingOut) return;
                setSigningOut(true);
                try {
                  // UX: navega imediatamente (não aguarda signOut)
                  try { setMobileOpen(false); } catch {}
                  try { router.replace("/login"); } catch {}

                  // Limpa estado e tokens de forma síncrona
                  signOutFast();
                } catch {
                  // best-effort: mesmo com erro, força redirecionamento
                } finally {
                  setSigningOut(false);
                }
              }}
              style={{ width: "100%" }}
              aria-busy={signingOut}
              disabled={signingOut}
            >
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        ) : null}
      </aside>
      ) : null}

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

	          <div className="row" style={{ gap: 10, alignItems: "center" }} />
        </header>

        <main className="content">{children}</main>

        <footer className="footer" role="contentinfo">
          <div className="footerInner">
            <div className="small muted">{DEVELOPED_BY}</div>
          </div>
        </footer>
      </div>

      {mobileOpen ? <div className="backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
    </div>
  );
}
