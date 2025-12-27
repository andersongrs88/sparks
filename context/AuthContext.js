import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { getProfileById } from "../lib/profiles";
import { normalizeRole } from "../lib/permissions";

/**
 * AuthContext
 * - Suporta Supabase Auth (Email/Password) quando as envs estão configuradas.
 * - Faz fallback para "noauth" quando Supabase não está configurado, para não travar o MVP.
 *
 * Roles:
 * - Acesso total (editar tudo): admin, consultor_educacao, designer
 * - Edita apenas PDCA: eventos, producao, mentoria, outros
 * - Visualização: viewer
 */
const AuthContext = createContext(null);

const FULL_ACCESS_ROLES = new Set(["admin", "consultor", "consultor_educacao", "designer"]);
const PDCA_EDIT_ROLES = new Set(["eventos", "producao", "mentoria", "outros"]);

const MAX_SESSION_MS = 60 * 60 * 1000; // 1 hora
const LOGIN_TS_KEY = "sparks_login_ts";
const LOGIN_UID_KEY = "sparks_login_uid";

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Cache em memória para evitar re-fetch do profile a cada navegação/re-render.
  // Mantém o app rápido em mobile e evita chamadas redundantes.
  const profileCacheRef = useRef({ userId: null, value: null, ts: 0 });
  const inflightRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  const refreshProfile = useCallback(async (u, { force = false } = {}) => {
    if (!u?.id) {
      setProfile(null);

          // Remove controle de sessão
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(LOGIN_TS_KEY);
              window.localStorage.removeItem(LOGIN_UID_KEY);
            } catch {}
          }
      return;
    }

    // Cache hit
    const cached = profileCacheRef.current;
    const now = Date.now();
    if (!force && cached?.userId === u.id && cached?.value && (now - (cached.ts || 0) < CACHE_TTL_MS)) {
      setProfile(cached.value);
      return;
    }

    // Evita múltiplos fetches concorrentes do mesmo profile.
    if (inflightRef.current) {
      try {
        const p = await inflightRef.current;
        setProfile(p || null);
      } catch {
        setProfile(null);

          // Remove controle de sessão
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(LOGIN_TS_KEY);
              window.localStorage.removeItem(LOGIN_UID_KEY);
            } catch {}
          }
      }
      return;
    }

    try {
      inflightRef.current = getProfileById(u.id);
      const p = await inflightRef.current;
      profileCacheRef.current = { userId: u.id, value: p || null, ts: Date.now() };
      setProfile(p || null);
    } catch (e) {
      // Se não houver profile ainda, não quebrar a UI.
      setProfile(null);

          // Remove controle de sessão
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(LOGIN_TS_KEY);
              window.localStorage.removeItem(LOGIN_UID_KEY);
            } catch {}
          }
      profileCacheRef.current = { userId: u.id, value: null, ts: Date.now() };
    } finally {
      inflightRef.current = null;
    }
  }, []);

  useEffect(() => {
    let unsub = null;

    async function init() {
      // Fallback NOAUTH: mantém o sistema utilizável se env não estiver configurada.
      if (!supabase) {
        setUser({ id: "noauth", email: "noauth@local" });
        setProfile({
          id: "noauth",
          name: "Acesso",
          email: "noauth@local",
          role: "admin",
          is_active: true
        });
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data?.session?.user || null;
        setUser(sessionUser);
        // Não bloqueia o primeiro paint do app em mobile.
        // Carrega profile em background e atualiza contexto quando chegar.
        refreshProfile(sessionUser).catch(() => {});

        // Listener
        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
          const u = session?.user || null;
          setUser(u);
          // Não aguarda (evita atrasos e race conditions em mobile/webview)
          refreshProfile(u, { force: true }).catch(() => {});
        });
        unsub = sub?.subscription || null;
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      try {
        unsub?.unsubscribe?.();
      } catch {}
    };
  }, [refreshProfile]);

  const role = normalizeRole(profile?.role || "viewer");
  // Mantém compatibilidade com bases antigas.

  // Timeout de sessão: após 1 hora logado, força deslogar.
  useEffect(() => {
    if (!supabase) return;

    // Limpa timer anterior
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (!user?.id || user.id === "noauth") return;

    if (typeof window === "undefined") return;

    try {
      const uid = window.localStorage.getItem(LOGIN_UID_KEY);
      const tsStr = window.localStorage.getItem(LOGIN_TS_KEY);

      // Se mudou de usuário, reinicia o relógio
      if (!uid || uid !== user.id || !tsStr) {
        window.localStorage.setItem(LOGIN_UID_KEY, user.id);
        window.localStorage.setItem(LOGIN_TS_KEY, String(Date.now()));
      }

      const ts = Number(window.localStorage.getItem(LOGIN_TS_KEY) || Date.now());
      const elapsed = Date.now() - ts;
      const remaining = Math.max(0, MAX_SESSION_MS - elapsed);

      sessionTimerRef.current = setTimeout(() => {
        // best-effort: não depende de estado React (evita race em navegação)
        supabase.auth.signOut({ scope: "local" }).catch(() => {});
        try {
          window.localStorage.removeItem(LOGIN_TS_KEY);
          window.localStorage.removeItem(LOGIN_UID_KEY);
        } catch {}
      }, remaining);
    } catch {
      // se localStorage falhar, não bloqueia o app
    }

    return () => {
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [user?.id]);

  const normRole = role === "consultor_educacao" ? "consultor" : role;
  const isFullAccess = FULL_ACCESS_ROLES.has(normRole) || FULL_ACCESS_ROLES.has(role) || (user?.id === "noauth");
  const canEditPdca = isFullAccess || PDCA_EDIT_ROLES.has(normRole) || PDCA_EDIT_ROLES.has(role);

  const value = useMemo(
    () => ({
      loading,
      user,
      profile,
      role,
      isFullAccess,
      canEditPdca,
      hasAuthEnabled: !!supabase,
      async signIn(email, password) {
        if (!supabase) throw new Error("Supabase não configurado.");
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
      },
      async signOut() {
        if (!supabase) return;

        // 1) Supabase sign-out (best-effort)
        // Em alguns navegadores móveis/webviews, storage pode falhar; então fazemos limpeza extra.
        try {
          // Supabase JS v2 aceita { scope: 'local' | 'global' | 'others' }
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) throw error;
        } finally {
          // 2) Força reset do estado local (evita UI ficar "logada" após falhas de storage)
          setUser(null);
          setProfile(null);

          // Remove controle de sessão
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(LOGIN_TS_KEY);
              window.localStorage.removeItem(LOGIN_UID_KEY);
            } catch {}
          }

          // 3) Limpeza defensiva do storage (evita sessão "grudar" em alguns devices)
          if (typeof window !== "undefined") {
            try {
              const keys = Object.keys(window.localStorage || {});
              for (const k of keys) {
                if (k.startsWith("sb-") && k.endsWith("-auth-token")) window.localStorage.removeItem(k);
                if (k === "supabase.auth.token") window.localStorage.removeItem(k);
              }
            } catch {}
          }
        }
      }
      ,
      // Logout instantâneo (UX): limpa estado e navega imediatamente.
      // Depois faz signOut best-effort.
      signOutFast() {
        if (!supabase) return;

        // 1) Reset local imediato
        setUser(null);
        setProfile(null);

          // Remove controle de sessão
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(LOGIN_TS_KEY);
              window.localStorage.removeItem(LOGIN_UID_KEY);
            } catch {}
          }
        profileCacheRef.current = { userId: null, value: null, ts: 0 };

        // 2) Limpeza defensiva
        if (typeof window !== "undefined") {
          try {
            const keys = Object.keys(window.localStorage || {});
            for (const k of keys) {
              if (k.startsWith("sb-") && k.endsWith("-auth-token")) window.localStorage.removeItem(k);
              if (k === "supabase.auth.token") window.localStorage.removeItem(k);
            }
          } catch {}
        }

        // 3) Sign-out assíncrono (não bloqueia UX)
        supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
    }),
    [loading, user, profile, role, isFullAccess, canEditPdca, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
