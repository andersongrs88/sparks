import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import {
  listTemplates,
  listTemplateItems,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createTemplateItem,
  updateTemplateItem,
  deleteTemplateItem
} from "../../lib/templates";
import { listActiveProfiles } from "../../lib/profiles";

const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];


export default function ChecklistTemplatesPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [profiles, setProfiles] = useState([]);

  const [newTpl, setNewTpl] = useState({ name: "", description: "" });
  const [newItem, setNewItem] = useState({
    phase: "PA-PRE",
    responsible_id: "",
    title: "",
    due_basis: "start",
    offset_days: -7,
    sort_order: 10
  });

  const [tplEdit, setTplEdit] = useState(null); // {name, description, is_active}
  const [itemEditId, setItemEditId] = useState("");
  const [itemEdit, setItemEdit] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  async function loadProfiles() {
    try {
      const list = await listActiveProfiles();
      setProfiles(list || []);
    } catch (_) {
      // perfis podem falhar por RLS; mantém vazio e segue
      setProfiles([]);
    }
  }

  async function loadTemplatesAndSelectFirst() {
    setError("");
    setLoading(true);
    try {
      const data = await listTemplates();
      setTemplates(data);
      const first = (data || []).find((t) => t.is_active) || (data || [])[0];
      if (first) setActiveId(first.id);
    } catch (e) {
      setError(e?.message || "Falha ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplatesAndSelectFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadItems(templateId) {
    if (!templateId) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    try {
      const data = await listTemplateItems(templateId);
      setItems(data);
    } catch (e) {
      setError(e?.message || "Falha ao carregar itens.");
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    loadItems(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const activeTemplate = useMemo(
    () => (templates || []).find((t) => t.id === activeId) || null,
    [templates, activeId]
  );

  useEffect(() => {
    if (activeTemplate) {
      setTplEdit({
        name: activeTemplate.name || "",
        description: activeTemplate.description || "",
        is_active: activeTemplate.is_active !== false
      });
    } else {
      setTplEdit(null);
    }
    setItemEditId("");
    setItemEdit(null);
  }, [activeTemplate?.id]);

  async function onCreateTemplate(e) {
    e.preventDefault();
    setError("");
    if (!newTpl.name.trim()) return setError("Preencha o nome do template.");
    try {
      const created = await createTemplate({
        name: newTpl.name.trim(),
        description: newTpl.description.trim(),
        is_active: true
      });
      setNewTpl({ name: "", description: "" });
      await Promise.all([loadTemplatesAndSelectFirst(), loadProfiles()]);
      setActiveId(created.id);
    } catch (e2) {
      setError(e2?.message || "Falha ao criar template.");
    }
  }

  async function onDeleteTemplate(t) {
    if (!t) return;
    const ok = window.confirm(
      `Tem certeza que deseja excluir o template "${t.name}"? Isso também apaga seus itens.`
    );
    if (!ok) return;
    try {
      await deleteTemplate(t.id);
      setActiveId("");
      await Promise.all([loadTemplatesAndSelectFirst(), loadProfiles()]);
    } catch (e) {
      setError(e?.message || "Falha ao excluir template.");
    }
  }

  async function onCreateItem(e) {
    e.preventDefault();
    setError("");
    if (!activeId) return setError("Selecione um template.");
    if (!newItem.title.trim()) return setError("Preencha o título da tarefa.");
    try {
      await createTemplateItem({
        template_id: activeId,
        phase: newItem.phase,
        area: newItem.area || null,
        title: newItem.title.trim(),
        due_basis: newItem.due_basis,
        offset_days: Number(newItem.offset_days || 0),
        sort_order: Number(newItem.sort_order || 0)
      });
      setNewItem((p) => ({ ...p, title: "", responsible_id: "" }));
      await loadItems(activeId);
    } catch (e2) {
      setError(e2?.message || "Falha ao criar item.");
    }
  }

  async function onDeleteItem(item) {
    const ok = window.confirm("Excluir esta tarefa do template?");
    if (!ok) return;
    try {
      await deleteTemplateItem(item.id);
      await loadItems(activeId);
    } catch (e) {
      setError(e?.message || "Falha ao excluir item.");
    }
  }

  return (
    <Layout title="Configurações • Templates de checklist">
      {error ? <div className="error">{error}</div> : null}

      <div className="grid2">
        <div className="card">
          <div className="h2">Templates</div>
          {loading ? <div className="small">Carregando…</div> : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {(templates || []).map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${t.id === activeId ? "primary" : ""}`}
                onClick={() => setActiveId(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>

          {activeTemplate ? (
            <div style={{ marginTop: 12 }}>
              <div className="small muted">Editar template selecionado</div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <div>
                  <div className="small">Nome</div>
                  <input
                    className="input"
                    value={tplEdit?.name || ""}
                    onChange={(e) => setTplEdit((p) => ({ ...(p || {}), name: e.target.value }))}
                  />
                </div>
                <div>
                  <div className="small">Descrição</div>
                  <input
                    className="input"
                    value={tplEdit?.description || ""}
                    onChange={(e) => setTplEdit((p) => ({ ...(p || {}), description: e.target.value }))}
                  />
                </div>
                <label className="row" style={{ gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={tplEdit?.is_active !== false}
                    onChange={(e) => setTplEdit((p) => ({ ...(p || {}), is_active: e.target.checked }))}
                  />
                  <span className="small">Ativo</span>
                </label>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn primary"
                  type="button"
                  onClick={async () => {
                    setError("");
                    try {
                      await updateTemplate(activeTemplate.id, {
                        name: tplEdit?.name,
                        description: tplEdit?.description,
                        is_active: tplEdit?.is_active,
                      });
                      await Promise.all([loadTemplatesAndSelectFirst(), loadProfiles()]);
                      setActiveId(activeTemplate.id);
                    } catch (e) {
                      setError(e?.message || "Falha ao salvar template.");
                    }
                  }}
                >
                  Salvar
                </button>
                <button className="btn" type="button" onClick={() => setTplEdit({ name: activeTemplate.name || "", description: activeTemplate.description || "", is_active: activeTemplate.is_active !== false })}>
                  Desfazer
                </button>
                <button className="btn danger" type="button" onClick={() => onDeleteTemplate(activeTemplate)}>
                  Excluir template
                </button>
              </div>
            </div>
          ) : null}

          <hr style={{ margin: "16px 0", borderColor: "#1f1f1f" }} />

          <div className="h2">Novo template</div>
          <form onSubmit={onCreateTemplate}>
            <div className="small">Nome</div>
            <input
              className="input"
              value={newTpl.name}
              onChange={(e) => setNewTpl((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="small" style={{ marginTop: 8 }}>
              Descrição
            </div>
            <input
              className="input"
              value={newTpl.description}
              onChange={(e) => setNewTpl((p) => ({ ...p, description: e.target.value }))}
            />
            <button className="btn primary" style={{ marginTop: 10 }}>
              Criar
            </button>
          </form>
        </div>

        <div className="card">
          <div className="h2">Itens do template</div>
          {!activeId ? <div className="small">Selecione um template à esquerda.</div> : null}
          {itemsLoading ? <div className="small">Carregando itens…</div> : null}

          {activeId ? (
            <>
              <div style={{ marginTop: 10 }}>
                {(items || []).length === 0 ? (
                  <div className="small">Nenhum item ainda.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {items.map((it) => (
                      <div key={it.id} className="card" style={{ padding: 12 }}>
                        {itemEditId === it.id ? (
                          <div style={{ display: "grid", gap: 8 }}>
                            <div className="row wrap" style={{ gap: 10 }}>
                              <div className="col">
                                <div className="small">Fase</div>
                                <select className="input" value={itemEdit?.phase || ""} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), phase: e.target.value }))}>
                                  {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                                </select>
                              </div>
                              <div className="col">
                                <div className="small">Responsável</div>
                                <select className="input" value={itemEdit?.responsible_id || ""} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), responsible_id: e.target.value }))}>
                                  <option value="">Sem responsável</option>
                                  {profiles.map((p) => <option key={p.id} value={p.id}>{(p.name || p.email || "Usuário").trim()}</option>)}
                                </select>
                              </div>
                              <div className="col">
                                <div className="small">Base</div>
                                <select className="input" value={itemEdit?.due_basis || "start"} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), due_basis: e.target.value }))}>
                                  <option value="start">Início</option>
                                  <option value="end">Fim</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <div className="small">Título</div>
                              <input className="input" value={itemEdit?.title || ""} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), title: e.target.value }))} />
                            </div>

                            <div className="row wrap" style={{ gap: 10 }}>
                              <div className="col">
                                <div className="small">Offset (dias)</div>
                                <input className="input" type="number" value={itemEdit?.offset_days ?? 0} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), offset_days: e.target.value }))} />
                              </div>
                              <div className="col">
                                <div className="small">Ordem</div>
                                <input className="input" type="number" value={itemEdit?.sort_order ?? 0} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), sort_order: e.target.value }))} />
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                className="btn primary"
                                type="button"
                                onClick={async () => {
                                  setError("");
                                  try {
                                    await updateTemplateItem(it.id, {
                                      phase: itemEdit?.phase,
                                      responsible_id: itemEdit?.responsible_id || null,
                                      due_basis: itemEdit?.due_basis,
                                      title: itemEdit?.title,
                                      offset_days: Number(itemEdit?.offset_days ?? 0),
                                      sort_order: Number(itemEdit?.sort_order ?? 0),
                                    });
                                    setItemEditId("");
                                    setItemEdit(null);
                                    await loadItems(activeId);
                                  } catch (e) {
                                    setError(e?.message || "Falha ao salvar item.");
                                  }
                                }}
                              >
                                Salvar
                              </button>
                              <button className="btn" type="button" onClick={() => { setItemEditId(""); setItemEdit(null); }}>
                                Cancelar
                              </button>
                              <button className="btn danger" type="button" onClick={() => onDeleteItem(it)}>
                                Excluir
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div>
                              <div className="h2" style={{ marginBottom: 4 }}>{it.title}</div>
                              <div className="small">Fase: {it.phase} • Área: {it.area || "-"} • Base: {it.due_basis} • Offset: {it.offset_days} dia(s)</div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="btn" type="button" onClick={() => { setItemEditId(it.id); setItemEdit({ ...it }); }}>
                                Editar
                              </button>
                              <button className="btn danger" type="button" onClick={() => onDeleteItem(it)}>
                                Excluir
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr style={{ margin: "16px 0", borderColor: "#1f1f1f" }} />

              <div className="h2">Adicionar item</div>
              <form onSubmit={onCreateItem}>
                <div className="row">
                  <div className="col">
                    <div className="small">Fase</div>
                    <select
                      className="input"
                      value={newItem.phase}
                      onChange={(e) => setNewItem((p) => ({ ...p, phase: e.target.value }))}
                    >
                      {PHASES.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col">
                    <div className="small">Responsável</div>
                    <select
                      className="input"
                      value={newItem.responsible_id}
                      onChange={(e) => setNewItem((p) => ({ ...p, responsible_id: e.target.value }))}
                    >
                      <option value="">Sem responsável</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {(p.name || p.email || "Usuário").trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col">
                    <div className="small">Base do prazo</div>
                    <select
                      className="input"
                      value={newItem.due_basis}
                      onChange={(e) => setNewItem((p) => ({ ...p, due_basis: e.target.value }))}
                    >
                      <option value="start">Início</option>
                      <option value="end">Fim</option>
                    </select>
                  </div>
                </div>

                <div className="small" style={{ marginTop: 8 }}>
                  Título
                </div>
                <input
                  className="input"
                  value={newItem.title}
                  onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                />

                <div className="row" style={{ marginTop: 8 }}>
                  <div className="col">
                    <div className="small">Offset (dias)</div>
                    <input
                      className="input"
                      type="number"
                      value={newItem.offset_days}
                      onChange={(e) => setNewItem((p) => ({ ...p, offset_days: e.target.value }))}
                    />
                    <div className="small">Ex.: -10 cria 10 dias antes.</div>
                  </div>
                  <div className="col">
                    <div className="small">Ordem</div>
                    <input
                      className="input"
                      type="number"
                      value={newItem.sort_order}
                      onChange={(e) => setNewItem((p) => ({ ...p, sort_order: e.target.value }))}
                    />
                  </div>
                </div>

                <button className="btn primary" style={{ marginTop: 10 }}>
                  Adicionar
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
