import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";

export default function NovoUsuario() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Usuários">
      <div className="container">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Como criar um novo usuário</h2>
          <p style={{ opacity: 0.9, lineHeight: 1.5 }}>
            Nesta versão (com Supabase Auth), a criação de usuários é feita pelo painel do Supabase.
            O sistema cria automaticamente um registro em <b>public.profiles</b> via trigger, e depois você ajusta o <b>role</b> aqui no app.
          </p>

          <ol style={{ lineHeight: 1.7 }}>
            <li>Acesse o Supabase do projeto.</li>
            <li>Vá em <b>Authentication → Users</b>.</li>
            <li>Clique em <b>Add user</b> e informe e-mail e senha.</li>
            <li>Volte aqui em <b>Usuários</b> e atualize a página.</li>
            <li>Clique no usuário e defina o <b>role</b> (admin / consultor_educacao / designer / eventos / tecnica / relacionamento / producao / mentoria / viewer).</li>
          </ol>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => router.push("/usuarios")}>Voltar para lista</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
