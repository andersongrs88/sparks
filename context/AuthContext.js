import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { getProfileById } from "../lib/profiles";

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

const FULL_ACCESS_ROLES = new Set(["admin", "consultor_educacao", "designer"]);
const PDCA_EDIT_ROLES = new Set(["eventos", "producao", "mentoria", "outros"]);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const refreshProfile = useCallback(async (u) => {
    if (!u?.id) {
      setProfile(null);
      return;
    }
    try {
      const p = await getProfileById(u.id);
      setProfile(p || null);
    } catch (e) {
      // Se não houver profile ainda, não quebrar a UI.
      setProfile(null);
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
        await refreshProfile(sessionUser);

        // Listener
        const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
          const u = session?.user || null;
          setUser(u);
          await refreshProfile(u);
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

  const role = profile?.role || "viewer";
  const isFullAccess = FULL_ACCESS_ROLES.has(role) || (user?.id === "noauth");
  const canEditPdca = isFullAccess || PDCA_EDIT_ROLES.has(role);

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
    }),
    [loading, user, profile, role, isFullAccess, canEditPdca]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
