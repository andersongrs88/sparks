import { useEffect } from "react";
import { useRouter } from "next/router";

// Autenticação removida temporariamente.
// Esta página existe apenas para manter compatibilidade com rotas antigas.
export default function LoginRemovedPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}
