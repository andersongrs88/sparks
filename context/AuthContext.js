import { createContext, useContext, useMemo } from "react";

// AUTENTICAÇÃO TEMPORARIAMENTE DESABILITADA
// Para o MVP sem login, todo mundo entra com acesso total.
// Quando você quiser reativar, basta restaurar o AuthContext com Supabase Auth.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const value = useMemo(
    () => ({
      loading: false,
      // Mantemos um "user" e "profile" fictícios para não quebrar as telas.
      user: { id: "noauth", email: "noauth@local" },
      profile: {
        id: "noauth",
        email: "noauth@local",
        name: "Acesso Livre",
        role: "admin",
        is_active: true
      },
      role: "admin",
      isFullAccess: true,
      async signIn() {
        // no-op
        return true;
      },
      async signOut() {
        // no-op
        return true;
      }
    }),
    []
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
