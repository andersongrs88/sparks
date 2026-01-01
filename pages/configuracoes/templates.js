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

  // UX: colapsos para reduzir ruído visual e melhorar leitura
  const [showTplEdit, setShowTplEdit] = useState(false);
  const [showNewTpl, setShowNewTpl] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);

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
    loadProfiles();
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

  const profileNameById = useMemo(() => {
    const m = new Map();
    for (const p of profiles || []) {
      const label = (p?.name || p?.email || "Usuário").trim();
      if (p?.id) m.set(p.id, label);
    }
    return m;
  }, [profiles]);

  const itemCounts = useMemo(() => {
    const counts = { total: 0 };
    for (const p of PHASES) counts[p.key] = 0;
    for (const it of items || []) {
      counts.total += 1;
      const k = String(it?.phase || "").trim();
      if (k && counts[k] !== undefined) counts[k] += 1;
    }
    return counts;
  }, [items]);

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
    // Quando trocar template, fecha edições para evitar confusão
    setShowTplEdit(false);
    setShowNewItem(false);
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
        responsible_id: newItem.responsible_id || null,
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

  const phaseLabel = (k) => (PHASES.find((p) => p.key === k)?.label || k || "-");
  const dueBasisLabel = (k) => (k === "end" ? "Fim" : "Início");
  const responsibleLabel = (responsibleId) => {
    const id = String(responsibleId || "").trim();
    if (!id) return "Sem responsável";
    return profileNameById.get(id) || "Responsável";
  };

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

      <div className="gridTemplates">
        {/* ESQUERDA: seleção e configurações do template (com colapsos) */}
        <div className="card">
          <div className="h2">Templates</div>
          <div className="small muted">Selecione um template e gerencie seus itens.</div>
          {loading ? <div className="small" style={{ marginTop: 8 }}>Carregando…</div> : null}

          <div className="tplList" style={{ marginTop: 12 }}>
            {(templates || []).length === 0 ? (
              <div className="small">Nenhum template encontrado.</div>
            ) : (
              (templates || []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tplListBtn ${t.id === activeId ? "active" : ""}`}
                  onClick={() => {
                    setActiveId(t.id);
                    setShowTplEdit(false);
                    setItemEditId("");
                    setItemEdit(null);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{t.name}</span>
                    {t.is_active ? <span className="badge success">Ativo</span> : <span className="badge muted">Inativo</span>}
                  </div>
                  {t.description ? <div className="small muted" style={{ marginTop: 4 }}>{t.description}</div> : null}
                </button>
              ))
            )}
          </div>

          {/* Configurações do template selecionado */}
          {activeTemplate ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setShowTplEdit((v) => !v)}
                style={{ width: "100%", justifyContent: "space-between" }}
              >
                <span>Configurações do template</span>
                <span className="small muted">{showTplEdit ? "Recolher" : "Expandir"}</span>
              </button>

              {showTplEdit ? (
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

                  <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setTplEdit({
                          name: activeTemplate.name || "",
                          description: activeTemplate.description || "",
                          is_active: activeTemplate.is_active !== false,
                        })
                      }
                    >
                      Desfazer
                    </button>
                    <button className="btn danger" type="button" onClick={() => onDeleteTemplate(activeTemplate)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Novo template (colapsado por padrão) */}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setShowNewTpl((v) => !v)}
              style={{ width: "100%", justifyContent: "space-between" }}
            >
              <span>+ Novo template</span>
              <span className="small muted">{showNewTpl ? "Recolher" : "Expandir"}</span>
            </button>
            {showNewTpl ? (
              <form onSubmit={onCreateTemplate} style={{ marginTop: 10 }}>
                <div className="small">Nome</div>
                <input className="input" value={newTpl.name} onChange={(e) => setNewTpl((p) => ({ ...p, name: e.target.value }))} />
                <div className="small" style={{ marginTop: 8 }}>Descrição</div>
                <input className="input" value={newTpl.description} onChange={(e) => setNewTpl((p) => ({ ...p, description: e.target.value }))} />
                <button className="btn primary" style={{ marginTop: 10 }}>Criar</button>
              </form>
            ) : null}
          </div>
        </div>

        {/* DIREITA: itens do template */}
        <div className="card">
          <div className="templatesRightHeader">
            <div>
              <div className="h2">Checklist do template: {activeTemplate?.name || "—"}</div>
              <div className="small muted">
                {itemCounts.total} item(ns) • PA-PRÉ: {itemCounts["PA-PRE"]} • DURANTE: {itemCounts["DURANTE"]} • PÓS: {itemCounts["POS"]}
              </div>
            </div>
            <button className="btn primary" type="button" onClick={() => setShowNewItem(true)}>
              + Adicionar item
            </button>
          </div>

          {!activeId ? <div className="small" style={{ marginTop: 10 }}>Selecione um template à esquerda.</div> : null}
          {itemsLoading ? <div className="small" style={{ marginTop: 10 }}>Carregando itens…</div> : null}

          {activeId ? (
            <>
              {showNewItem ? (
                <div className="card" style={{ marginTop: 12, padding: 12 }}>
                  <div className="h2" style={{ marginBottom: 6 }}>Adicionar item</div>
                  <form onSubmit={(e) => { onCreateItem(e); setShowNewItem(false); }}>
                    <div>
                      <div className="small">Título</div>
                      <input className="input" value={newItem.title} onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))} />
                    </div>

                    <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                      <div className="col">
                        <div className="small">Fase</div>
                        <select className="input" value={newItem.phase} onChange={(e) => setNewItem((p) => ({ ...p, phase: e.target.value }))}>
                          {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="col">
                        <div className="small">Responsável</div>
                        <select className="input" value={newItem.responsible_id} onChange={(e) => setNewItem((p) => ({ ...p, responsible_id: e.target.value }))}>
                          <option value="">Sem responsável</option>
                          {profiles.map((p) => <option key={p.id} value={p.id}>{(p.name || p.email || "Usuário").trim()}</option>)}
                        </select>
                      </div>
                      <div className="col">
                        <div className="small">Base do prazo</div>
                        <select className="input" value={newItem.due_basis} onChange={(e) => setNewItem((p) => ({ ...p, due_basis: e.target.value }))}>
                          <option value="start">Início</option>
                          <option value="end">Fim</option>
                        </select>
                      </div>
                    </div>

                    <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                      <div className="col">
                        <div className="small">Offset (dias)</div>
                        <input className="input" type="number" value={newItem.offset_days} onChange={(e) => setNewItem((p) => ({ ...p, offset_days: e.target.value }))} />
                        <div className="small muted">Ex.: -10 cria 10 dias antes.</div>
                      </div>
                      <div className="col">
                        <div className="small">Ordem</div>
                        <input className="input" type="number" value={newItem.sort_order} onChange={(e) => setNewItem((p) => ({ ...p, sort_order: e.target.value }))} />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button className="btn primary" type="submit">Adicionar</button>
                      <button className="btn" type="button" onClick={() => setShowNewItem(false)}>Cancelar</button>
                    </div>
                  </form>
                </div>
              ) : null}

              <div className="tplItemsList" style={{ marginTop: 12 }}>
                {(items || []).length === 0 ? (
                  <div className="small">Nenhum item ainda.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {items.map((it) => (
                      <div key={it.id} className="tplItemRow">
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
                          <div className="tplItemRowInner">
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 16, lineHeight: "22px" }}>{it.title}</div>
                              <div className="tplBadges" style={{ marginTop: 8 }}>
                                <span className="badge">{phaseLabel(it.phase)}</span>
                                <span className="badge muted">{responsibleLabel(it.responsible_id)}</span>
                                <span className="badge muted">Base: {dueBasisLabel(it.due_basis)}</span>
                                <span className="badge muted">Offset: {Number(it.offset_days ?? 0)} dia(s)</span>
                                <span className="badge muted">Ordem: {Number(it.sort_order ?? 0)}</span>
                              </div>
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
            </>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
