import "../styles/globals.css";
import { AuthProvider } from "../context/AuthContext";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/router";
import { useEffect, useMemo } from "react";

function AuthGate({ children }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  const publicRoutes = useMemo(() => new Set(["/login", "/esqueci-minha-senha"]), []);
  const isPublicRoute = publicRoutes.has(router.pathname);

  useEffect(() => {
    if (!router.isReady) return;
    if (isPublicRoute) return;
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [router.isReady, isPublicRoute, loading, user, router]);

  // Evita “flash” de conteúdo protegido antes do redirect.
  if (!isPublicRoute && (loading || !user)) return null;

  return children;
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AuthGate>
        <Component {...pageProps} />
      </AuthGate>
    </AuthProvider>
  );
}
