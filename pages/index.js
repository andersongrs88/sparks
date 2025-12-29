import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
      // se NÃO tiver sessão → fica no login
    });
  }, []);

  return (
    <>
      {/* COMPONENTE DE LOGIN AQUI */}
    </>
  );
}
