import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  IMMERSION_FORMATS,
  createImmersionCatalog,
  deleteImmersionCatalog,
  listImmersionCatalog,
  updateImmersionCatalog
} from "../../lib/immersionCatalog";

function formatLabel(value) {
  return IMMERSION_FORMATS.find((f) => f.value === value)?.label || value || "-";
}

export default function CadastroImersoesPage() {
  const { loading: authLoading, isFullAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rows, setRows] = useState([]);
  const [activeId, setActiveId] = useState("");

  const active = useMemo(() => rows.find((r) => String(r.id) === String(activeId)) || null, [rows, activeId]);

  const [name, setName] = useState("");
  const [format, setFormat] = useState("presencial");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const data = await listImmersionCatalog();
      setRows(data);
      if (!activeId && data?.[0]?.id) setActiveId(String(data[0].id));
    } catch (e) {
      setError(e?.message || "Falha ao carregar cadastro de imersões.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  function resetForm() {
    setName("");
    setFormat("presencial");
    setIsActive(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!isFullAccess) return;
    setSaving(true);
    setError("");
    try {
      const created = await createImmersionCatalog({ name, format, is_active: isActive });
      setRows((prev) => [created, ...(prev || [])]);
      setActiveId(String(created.id));
      resetForm();
    } catch (e2) {
      setError(e2?.message || "Falha ao criar cadastro de imersão.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    if (!isFullAccess) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateImmersionCatalog(row.id, { is_active: !row.is_active });
      setRows((prev) => (prev || []).map((r) => (r.id === row.id ? updated : r)));
    } catch (e2) {
      setError(e2?.message || "Falha ao atualizar status.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!isFullAccess) return;
    if (!confirm("Excluir este cadastro de imersão? Essa ação não pode ser desfeita.")) return;
    setSaving(true);
    setError("");
    try {
      await deleteImmersionCatalog(row.id);
      setRows((prev) => (prev || []).filter((r) => r.id !== row.id));
      if (String(activeId) === String(row.id)) setActiveId("");
    } catch (e2) {
      setError(e2?.message || "Falha ao excluir.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Configurações • Cadastro de imersões">
      <div className="pageHeader">
        <h1>Configurações • Cadastro de imersões</h1>
        <p className="muted">Padronize nomes e formatos para uso futuro em “Nova imersão”.</p>
      </div>

      {error ? <div className="errorBanner" role="alert">{error}</div> : null}

      <div className="grid2">
        <section className="card">
          <div className="cardHeader">
            <h2>Imersões cadastradas</h2>
            <div className="muted">{loading ? "Carregando..." : `${rows.length} registro(s)`}</div>
          </div>

          <div className="list" role="list">
            {(rows || []).map((row) => {
              const selected = String(row.id) === String(activeId);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={selected ? "listItem active" : "listItem"}
                  onClick={() => setActiveId(String(row.id))}
                >
                  <div className="listMain">
                    <div className="listTitle">{row.name}</div>
                    <div className="listMeta">
                      <span className="chip">{formatLabel(row.format)}</span>
                      <span className={row.is_active ? "badge ok" : "badge"}>{row.is_active ? "Ativo" : "Inativo"}</span>
                    </div>
                  </div>
                  <span aria-hidden="true" className="chev">›</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="cardHeader">
            <h2>Novo cadastro</h2>
            <div className="muted">{isFullAccess ? "Admin/Consultor/Designer" : "Somente leitura"}</div>
          </div>

          <form onSubmit={handleCreate} className="form" aria-disabled={!isFullAccess || saving}>
            <label className="field">
              <span className="label">Nome da Imersão</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Acelerador Time Redes Sociais"
                inputMode="text"
                autoComplete="off"
                required
                disabled={!isFullAccess || saving}
              />
            </label>

            <label className="field">
              <span className="label">Formato</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={!isFullAccess || saving}>
                {IMMERSION_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>

            <label className="field row">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!isFullAccess || saving}
              />
              <span className="labelInline">Ativo</span>
            </label>

            <button className="btn primary" type="submit" disabled={!isFullAccess || saving}>
              {saving ? "Salvando..." : "Criar"}
            </button>

            <p className="muted small">Toque: botões e inputs têm altura mínima para uso confortável no mobile.</p>
          </form>

          <div className="divider" />

          <div className="cardHeader">
            <h2>Detalhes</h2>
            <div className="muted">Ações rápidas</div>
          </div>

          {active ? (
            <div className="details">
              <div><strong>Nome:</strong> {active.name}</div>
              <div><strong>Formato:</strong> {formatLabel(active.format)}</div>
              <div><strong>Status:</strong> {active.is_active ? "Ativo" : "Inativo"}</div>

              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => toggleActive(active)}
                  disabled={!isFullAccess || saving}
                >
                  {active.is_active ? "Marcar como inativo" : "Marcar como ativo"}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => handleDelete(active)}
                  disabled={!isFullAccess || saving}
                >
                  Excluir
                </button>
              </div>
            </div>
          ) : (
            <div className="muted">Selecione um cadastro na lista para ver detalhes.</div>
          )}
        </section>
      </div>

      <style jsx>{`
        .pageHeader { margin: 4px 0 16px; }
        .pageHeader h1 { margin: 0; font-size: 18px; }
        .muted { color: #667085; }
        .small { font-size: 12px; }
        .errorBanner { background: #fff4f4; border: 1px solid #ffd0d0; padding: 10px 12px; border-radius: 12px; margin: 10px 0; }

        .grid2 { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 960px) { .grid2 { grid-template-columns: 420px 1fr; } }

        .card { background: #fff; border: 1px solid #eaecf0; border-radius: 16px; padding: 12px; box-shadow: 0 1px 2px rgba(16,24,40,.05); }
        .cardHeader { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; }
        .cardHeader h2 { margin: 0; font-size: 16px; }

        .list { display: grid; gap: 8px; }
        .listItem { width: 100%; text-align: left; background: #fff; border: 1px solid #eaecf0; border-radius: 14px; padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .listItem:focus { outline: 3px solid rgba(153,130,255,.35); outline-offset: 2px; }
        .listItem.active { border-color: rgba(153,130,255,.6); box-shadow: 0 0 0 3px rgba(153,130,255,.15); }
        .listTitle { font-weight: 700; }
        .listMeta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
        .chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; border: 1px solid #eaecf0; font-size: 12px; }
        .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: #f2f4f7; font-size: 12px; }
        .badge.ok { background: #ecfdf3; }

        .chev { color: #98a2b3; font-size: 18px; }

        .form { display: grid; gap: 10px; }
        .field { display: grid; gap: 6px; }
        .label { font-weight: 600; font-size: 13px; }
        input, select { height: 44px; border-radius: 12px; border: 1px solid #d0d5dd; padding: 0 12px; font-size: 14px; }
        input:focus, select:focus { outline: 3px solid rgba(153,130,255,.35); outline-offset: 2px; }
        .row { grid-auto-flow: column; grid-template-columns: 20px 1fr; align-items: center; }
        .labelInline { font-weight: 600; }

        .btn { height: 44px; border-radius: 12px; border: 1px solid #d0d5dd; padding: 0 12px; background: #fff; font-weight: 700; }
        .btn.primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        .btn.danger { background: #fff; border-color: #fda29b; color: #b42318; }
        .btn:disabled { opacity: .6; }
        .divider { height: 1px; background: #eaecf0; margin: 12px 0; }

        .details { display: grid; gap: 8px; }
        .actions { display: grid; gap: 10px; margin-top: 8px; }
        @media (min-width: 600px) { .actions { grid-auto-flow: column; grid-template-columns: 1fr 1fr; } }
      `}</style>
    </Layout>
  );
}
