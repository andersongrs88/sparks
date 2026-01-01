import { useEffect } from "react";
import { useRouter } from "next/router";

// Página antiga de templates (legado). Mantida apenas por compatibilidade.
// Use: /configuracoes/templates
export default function TemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/configuracoes/templates");
  }, [router]);
  return null;
}
