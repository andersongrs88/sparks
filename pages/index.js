import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

/**
 * Rota raiz "/"
 * - Sem sessão => leva para /login
 * - Com sessão => leva para /dashboard
 *
 * Mantém o comportamento esperado ao abrir o link (login) e ao estar autenticado (dashboard).
 */
export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    // Deslogado: garante que o usuário veja o login ao acessar o link
    if (!user) {
      router.replace("/login");
      return;
    }

    // Logado: segue para o dashboard
    router.replace("/dashboard");
  }, [loading, user, router]);

  return null;
}
