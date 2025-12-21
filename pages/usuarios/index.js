import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { listProfiles } from "../../lib/profiles";

export default function UsuariosListPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const data = await listProfiles();
        if (mounted) setItems(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar usuários.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  return (
    <Layout title="Usuários">
      <div className="card">
        <div className="topbar" style={{ marginBottom: 10 }}>
          <div>
            <div className="h2">Usuários</div>
            <div className="small">Cadastre responsáveis (Consultor, Designer, Básico, Administrador).</div>
          </div>
          <button className="btn primary" onClick={() => router.push("/usuarios/novo")}>
            Novo usuário
          </button>
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}
        {loading ? <div className="small">Carregando...</div> : null}

        {!loading && items.length === 0 ? (
          <div className="small">Nenhum usuário cadastrado ainda.</div>
        ) : null}

        {!loading && items.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Tipo</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/usuarios/${u.id}`)}>
                  <td>{u.name}</td>
                  <td>{u.email || "-"}</td>
                  <td>{u.role}</td>
                  <td>{u.is_active ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <div className="small" style={{ marginTop: 12 }}>
          Dica: clique em um usuário para editar ou desativar.
        </div>
      </div>
    </Layout>
  );
}
