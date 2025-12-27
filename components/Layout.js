import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { canSeeMenuItem, roleLabel } from "../lib/permissions";
import { getNotificationSummary } from "../lib/notifications";
import { pollAndNotify } from "../lib/browserNotifications";
// Notificações removidas por opção de produto (tela não utilizada).

const SYSTEM_FULL_NAME = "Sparks by Educagrama, Sistema Inteligente de Planejamento e Gestão do Conhecimento";
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

export default function Layout({ title, children, hideNav = false }) {
  const { loading, profile, isFullAccess, user, signOutFast } = useAuth();
  const router = useRouter();
  const role = profile?.role;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const pageTitle = useMemo(() => title || "Sparks", [title]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!user || user.id === "noauth") { setNotifCount(0); return; }
        const res = await getNotificationSummary({ user, profile, isFullAccess });
        if (!alive) return;
        setNotifCount(Number(res?.total || 0));
      } catch {
        if (!alive) return;
        setNotifCount(0);
      }
    })();
    return () => { alive = false; };
  }, [user?.id, profile?.role, isFullAccess]);

  // Browser notifications (opt-in). Polls periodically while the app is open.
  useEffect(() => {
    let alive = true;
    if (!user || user.id === "noauth") return;

    async function tick() {
      if (!alive) return;
      try {
        await pollAndNotify({ user, profile, isFullAccess });
      } catch {
        // best-effort
      }
    }

    tick();
    const id = setInterval(tick, 120_000);
    return () => { alive = false; clearInterval(id); };
  }, [user?.id, profile?.role, isFullAccess]);
  const documentTitle = useMemo(() => {
    // Discreto: mantém o nome completo do sistema no título do navegador,
    // sem poluir a UI de cada tela.
    return `${pageTitle} | ${SYSTEM_FULL_NAME}`;
  }, [pageTitle]);

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
            <div className="brand">Sparks by Educagrama</div>
            <div className="brandSub muted" aria-label={SYSTEM_FULL_NAME}>{SYSTEM_FULL_NAME}</div>
          </div>
          <button type="button" className="btn icon mobileOnly" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            ✕
          </button>
        </div>

        <div className="sidebarMeta">
          <div className="small">{loading ? "Carregando..." : roleLabel(role)}</div>
          <div className="small muted">{profile?.email || user?.email || ""}</div>
        </div>

        <nav className="nav" aria-label="Navegação principal">
          {canSeeMenuItem(role, "dashboard") ? <NavItem href="/dashboard" label="Dashboard" icon="▦" /> : null}
          {canSeeMenuItem(role, "imersoes") ? <NavItem href="/imersoes" label="Imersões" icon="📅" /> : null}
          {canSeeMenuItem(role, "painel") ? <NavItem href="/painel" label="Plano de Ação" icon="✅" /> : null}
          {canSeeMenuItem(role, "relatorios") ? <NavItem href="/relatorios" label="Relatórios" icon="📊" /> : null}
          {canSeeMenuItem(role, "templates") ? <NavItem href="/configuracoes/templates" label="Templates" icon="🧩" /> : null}
          {canSeeMenuItem(role, "palestrantes") ? <NavItem href="/palestrantes" label="Palestrantes" icon="🎤" /> : null}
          {canSeeMenuItem(role, "usuarios") ? <NavItem href="/usuarios" label="Usuários" icon="👤" /> : null}
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

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn icon"
              onClick={async () => {
                try {
                  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
                    await Notification.requestPermission();
                  }
                } catch {}
                router.push("/notificacoes");
              }}
              aria-label="Abrir notificações"
              title="Notificações"
            >
              🔔
              {notifCount > 0 ? <span className="badge" aria-label={`${notifCount} notificações`}>{notifCount}</span> : null}
            </button>
            <ThemeToggle />
          </div>
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
