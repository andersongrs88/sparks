import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { FULL_ACCESS_ROLES } from "../lib/permissions";

const AuthContext = createContext(null);

async function fetchProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, name, role, is_active, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data?.session?.user ?? null;
        if (!mounted) return;
        setUser(sessionUser);

        if (sessionUser) {
          const p = await fetchProfile(sessionUser.id);
          if (!mounted) return;
          setProfile(p);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setUser(null);
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          const p = await fetchProfile(sessionUser.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error(e);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const role = profile?.role ?? null;
  const isFullAccess = role ? FULL_ACCESS_ROLES.includes(role) : false;

  const value = useMemo(() => ({
    loading,
    user,
    profile,
    role,
    isFullAccess,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return true;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return true;
    }
  }), [loading, user, profile, role, isFullAccess]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
