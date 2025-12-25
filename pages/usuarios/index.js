import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { listProfiles } from "../../lib/profiles";

const ROLES_LABEL = {
  admin: "Administrador",
  consultor_educacao: "Consultor (Educação)",
  designer: "Designer Instrucional",
  eventos: "Eventos (edita PDCA)",
  producao: "Produção (edita PDCA)",
  mentoria: "Mentoria (edita PDCA)",
  outros: "Outros (edita PDCA)",
  viewer: "Somente visualização"
};

export default function UsuariosListPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    if (!authLoading && user && !isFullAccess) {
      router.replace("/dashboard");
      return;
    }

    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const data = await listProfiles();
        if (mounted) setItems(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar usuários.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [router, authLoading, user, isFullAccess]);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((u) => {
      return (
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  return (
    <Layout title="Usuários">
      <div className="card">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <div className="h2">Usuários</div>
            <div className="small">Aqui você cadastra responsáveis para usar nas tarefas do Checklist.</div>
          </div>

          <button className="btn primary" type="button" onClick={() => router.push("/usuarios/novo")}>
            Novo usuário
          </button>
        </div>

        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input
            className="input sm"
            placeholder="Buscar por nome, email ou tipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}
        {loading ? <div className="small">Carregando...</div> : null}

        {!loading && filtered.length === 0 ? (
          <div className="small">Nenhum usuário encontrado.</div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <div className="tableWrap">
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
              {filtered.map((u) => (
                <tr key={u.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/usuarios/${u.id}`)}>
                  <td>{u.name}</td>
                  <td>{u.email || "-"}</td>
                  <td>{ROLES_LABEL[u.role] || u.role || "-"}</td>
                  <td>{u.is_active ? "Sim" : "Não"}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        ) : null}

        <div className="small" style={{ marginTop: 12 }}>
          Dica: clique em um usuário para editar/ativar/desativar.
        </div>
      </div>
    </Layout>
  );
}
