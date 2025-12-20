import { useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { requireAuth } from "../../lib/auth";
import { getImmersionById } from "../../lib/mock";

export default function ImmersionDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    requireAuth(router);
  }, [router]);

  const item = useMemo(() => (typeof id === "string" ? getImmersionById(id) : null), [id]);

  if (!item) {
    return (
      <Layout title="Imersão">
        <div className="card">
          <div className="h2">Carregando...</div>
          <div className="small">Se o ID não existir, voltaremos para a lista.</div>
          <div style={{ height: 10 }} />
          <button className="btn" onClick={() => router.push("/imersoes")}>Voltar</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Imersão ${item.id}`}>
      <div className="row">
        <div className="col card">
          <div className="h2">Informações</div>
          <div style={{ marginBottom: 8 }}><b>Nome:</b> {item.name}</div>
          <div style={{ marginBottom: 8 }}><b>Tipo:</b> {item.type}</div>
          <div style={{ marginBottom: 8 }}><b>Local:</b> {item.location}</div>
          <div style={{ marginBottom: 8 }}><b>Datas:</b> {item.start} → {item.end}</div>
          <div style={{ marginBottom: 8 }}><b>Status:</b> {item.status}</div>
        </div>

        <div className="col card">
          <div className="h2">Checklist (mock)</div>
          <div style={{ marginBottom: 8 }}><b>Total:</b> {item.checklist.total}</div>
          <div style={{ marginBottom: 8 }}><b>Concluídas:</b> {item.checklist.done}</div>
          <div style={{ marginBottom: 8 }}><b>Atrasadas:</b> {item.checklist.late}</div>
          <div className="small">Próximo passo: criar as tarefas por fase (PA-PRÉ / Durante / Pós).</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="card">
        <div className="h2">Ações</div>
        <div className="row">
          <button className="btn" onClick={() => router.push("/imersoes")}>Voltar para lista</button>
          <button className="btn primary" onClick={() => alert("Próximo passo: editar e salvar no banco (vamos implementar).")}>
            Editar
          </button>
          <button className="btn danger" onClick={() => alert("Próximo passo: exclusão com confirmação + persistência.")}>
            Excluir
          </button>
        </div>
      </div>
    </Layout>
  );
}
