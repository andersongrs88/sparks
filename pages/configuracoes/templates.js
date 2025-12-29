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

const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];

const AREAS = [
  { key: "eventos", label: "Eventos" },
  { key: "tecnica", label: "Técnica" },
  { key: "relacionamento", label: "Relacionamento" },
  { key: "producao", label: "Produção" },
  { key: "mentoria", label: "Mentoria" }
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

  const [newTpl, setNewTpl] = useState({ name: "", description: "" });
  const [newItem, setNewItem] = useState({
    phase: "PA-PRE",
    area: "eventos",
    title: "",
    due_basis: "start",
    offset_days: -7,
    sort_order: 10
  });

  const [tplEdit, setTplEdit] = useState(null); // {name, description, is_active}
  const [itemEditId, setItemEditId] = useState("");
  const [itemEdit, setItemEdit] = useState(null);

  const [showEditTemplate, setShowEditTemplate] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  function phaseLabel(key) {
    return PHASES.find((p) => p.key === key)?.label || key || "-";
  }

  function areaLabel(key) {
    if (!key) return "-";
    return AREAS.find((a) => a.key === key)?.label || key;
  }

  function dueBasisLabel(v) {
    if (v === "end") return "Fim";
    return "Início";
  }

  function prettyErrorMessage(raw) {
    const msg = String(raw || "");
    if (!msg) return "";
    // Evita expor detalhes técnicos (ex.: erros SQL) para o usuário.
    if (msg.includes("does not exist") || msg.includes("column") || msg.includes("relation")) {
      return "Não foi possível carregar ou salvar os dados deste template. Verifique se o schema do Supabase está atualizado.";
    }
    return msg;
  }

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  async function loadTemplatesAndSelectFirst() {
    setError("");
    setLoading(true);
    try {
      const data = await listTemplates();
      setTemplates(data);
      const first = (data || []).find((t) => t.is_active) || (data || [])[0];
      if (first) setActiveId(first.id);
    } catch (e) {
      setError(prettyErrorMessage(e?.message || "Falha ao carregar templates."));
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
      setError(prettyErrorMessage(e?.message || "Falha ao carregar itens."));
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
    setShowEditTemplate(false);
    setShowAddItem(false);
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
      setShowNewTemplate(false);
      await loadTemplatesAndSelectFirst();
      setActiveId(created.id);
    } catch (e2) {
      setError(prettyErrorMessage(e2?.message || "Falha ao criar template."));
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
      await loadTemplatesAndSelectFirst();
    } catch (e) {
      setError(prettyErrorMessage(e?.message || "Falha ao excluir template."));
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
      setNewItem((p) => ({ ...p, title: "" }));
      setShowAddItem(false);
      await loadItems(activeId);
    } catch (e2) {
      setError(prettyErrorMessage(e2?.message || "Falha ao criar item."));
    }
  }

  async function onDeleteItem(item) {
    const ok = window.confirm("Excluir esta tarefa do template?");
    if (!ok) return;
    try {
      await deleteTemplateItem(item.id);
      await loadItems(activeId);
    } catch (e) {
      setError(prettyErrorMessage(e?.message || "Falha ao excluir item."));
    }
  }

  const phaseCounts = useMemo(() => {
    const out = { total: (items || []).length };
    for (const p of PHASES) out[p.key] = 0;
    for (const it of items || []) {
      const k = it.phase || "";
      if (k in out) out[k] += 1;
    }
    return out;
  }, [items]);

  return (
    <Layout title="Configurações • Templates de checklist">
      {error ? <div className="error">{prettyErrorMessage(error)}</div> : null}

      <div className="grid2" style={{ gridTemplateColumns: "0.9fr 1.1fr" }}>
        {/* LEFT: Templates */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div>
            <div className="h2" style={{ marginBottom: 4 }}>Templates</div>
            <div className="small muted">Selecione um template e gerencie seus itens.</div>
            {loading ? <div className="small" style={{ marginTop: 8 }}>Carregando…</div> : null}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {(templates || []).map((t) => {
              const active = t.id === activeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="btn"
                  onClick={() => setActiveId(t.id)}
                  style={{
                    justifyContent: "space-between",
                    width: "100%",
                    borderColor: active ? "rgba(37,99,235,0.35)" : undefined,
                    background: active ? "rgba(37,99,235,0.08)" : undefined,
                    fontWeight: active ? 800 : 700,
                    padding: "10px 12px",
                    borderRadius: 14,
                  }}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{t.name}</span>
                  <span className={`badge ${t.is_active ? "success" : "muted"}`}>
                    {t.is_active ? "Ativo" : "Inativo"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Edit template */}
          {activeTemplate ? (
            <details open={showEditTemplate} onToggle={(e) => setShowEditTemplate(e.currentTarget.open)} className="card" style={{ padding: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                Configurações do template
                <span className="small muted" style={{ marginLeft: 10 }}>(editar)</span>
              </summary>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={tplEdit?.is_active !== false}
                    onChange={(e) => setTplEdit((p) => ({ ...(p || {}), is_active: e.target.checked }))}
                  />
                  <span className="chkLabel">Ativo</span>
                </label>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                        await loadTemplatesAndSelectFirst();
                        setActiveId(activeTemplate.id);
                      } catch (e) {
                        setError(prettyErrorMessage(e?.message || "Falha ao salvar template."));
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
            </details>
          ) : null}

          {/* New template */}
          <details open={showNewTemplate} onToggle={(e) => setShowNewTemplate(e.currentTarget.open)} className="card" style={{ padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>+ Novo template</summary>
            <form onSubmit={onCreateTemplate} style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div>
                <div className="small">Nome</div>
                <input
                  className="input"
                  value={newTpl.name}
                  onChange={(e) => setNewTpl((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <div className="small">Descrição</div>
                <input
                  className="input"
                  value={newTpl.description}
                  onChange={(e) => setNewTpl((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <button className="btn primary">Criar</button>
            </form>
          </details>
        </div>

        {/* RIGHT: Items */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="h2" style={{ marginBottom: 4 }}>
                  Checklist do template: {activeTemplate?.name || "-"}
                </div>
                <div className="small muted">
                  {activeId ? (
                    <>
                      {phaseCounts.total} item(ns) • {PHASES.map((p) => `${p.label}: ${phaseCounts[p.key] || 0}`).join(" • ")}
                    </>
                  ) : (
                    "Selecione um template à esquerda."
                  )}
                </div>
              </div>
              {activeId ? (
                <button className="btn primary" type="button" onClick={() => setShowAddItem((v) => !v)}>
                  + Adicionar item
                </button>
              ) : null}
            </div>
          </div>

          {!activeId ? <div className="small">Selecione um template à esquerda.</div> : null}
          {itemsLoading ? <div className="small">Carregando itens…</div> : null}

          {activeId ? (
            <>
              <div style={{ marginTop: 10 }}>
                {(items || []).length === 0 ? (
                  <div className="card" style={{ padding: 14, background: "rgba(37,99,235,0.05)", borderColor: "rgba(37,99,235,0.15)" }}>
                    <div className="h2" style={{ marginBottom: 6 }}>Nenhum item ainda</div>
                    <div className="small muted">Use “Adicionar item” para montar o checklist deste template.</div>
                  </div>
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
                                <div className="small">Área</div>
                                <select className="input" value={itemEdit?.area || ""} onChange={(e) => setItemEdit((p) => ({ ...(p || {}), area: e.target.value }))}>
                                  {AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
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
                                      area: itemEdit?.area,
                                      due_basis: itemEdit?.due_basis,
                                      title: itemEdit?.title,
                                      offset_days: Number(itemEdit?.offset_days ?? 0),
                                      sort_order: Number(itemEdit?.sort_order ?? 0),
                                    });
                                    setItemEditId("");
                                    setItemEdit(null);
                                    await loadItems(activeId);
                                  } catch (e) {
                                    setError(prettyErrorMessage(e?.message || "Falha ao salvar item."));
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
                              <div className="h2" style={{ marginBottom: 6 }}>{it.title}</div>
                              <div className="row wrap" style={{ gap: 8 }}>
                                <span className="badge">{phaseLabel(it.phase)}</span>
                                <span className="badge muted">{areaLabel(it.area)}</span>
                                <span className="badge muted">Base: {dueBasisLabel(it.due_basis)}</span>
                                <span className="badge muted">Offset: {Number(it.offset_days || 0)} dia(s)</span>
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

              {showAddItem ? (
                <div className="card" style={{ padding: 14 }}>
                  <div className="h2" style={{ marginBottom: 10 }}>Adicionar item</div>
                  <form onSubmit={onCreateItem}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <div className="small">Título</div>
                        <input
                          className="input"
                          value={newItem.title}
                          onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                          placeholder="Ex.: Enviar informações para jurídico"
                          autoFocus
                        />
                      </div>

                      <div className="row wrap" style={{ gap: 10 }}>
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
                          <div className="small">Área</div>
                          <select
                            className="input"
                            value={newItem.area}
                            onChange={(e) => setNewItem((p) => ({ ...p, area: e.target.value }))}
                          >
                            {AREAS.map((a) => (
                              <option key={a.key} value={a.key}>
                                {a.label}
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

                      <div className="row wrap" style={{ gap: 10 }}>
                        <div className="col">
                          <div className="small">Offset (dias)</div>
                          <input
                            className="input"
                            type="number"
                            value={newItem.offset_days}
                            onChange={(e) => setNewItem((p) => ({ ...p, offset_days: e.target.value }))}
                          />
                          <div className="small muted">Ex.: -10 cria 10 dias antes.</div>
                        </div>
                        <div className="col">
                          <div className="small">Ordem (avançado)</div>
                          <input
                            className="input"
                            type="number"
                            value={newItem.sort_order}
                            onChange={(e) => setNewItem((p) => ({ ...p, sort_order: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn primary">Adicionar</button>
                        <button className="btn" type="button" onClick={() => setShowAddItem(false)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
