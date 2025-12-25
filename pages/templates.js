import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import {
  listTaskTemplates,
  createTaskTemplate,
  deleteTaskTemplate,
  listScheduleTemplates,
  createScheduleTemplate,
  deleteScheduleTemplate,
  listMaterialTemplates,
  createMaterialTemplate,
  deleteMaterialTemplate,
  listToolTemplates,
  createToolTemplate,
  deleteToolTemplate,
  listVideoTemplates,
  createVideoTemplate,
  deleteVideoTemplate,
  publishTemplate,
  unpublishTemplate,
  duplicateTemplate,
} from "../lib/templates";

const IMMERSION_TYPES = ["Presencial", "Online", "Zoom", "Entrada", "Extras", "Giants", "Outras"]; // domínio
const PHASES = ["PA-PRE", "DURANTE", "POS"];

function Tab({ active, onClick, children }) {
  return (
    <button type="button" className={active ? "tab active" : "tab"} onClick={onClick}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const { user, loading, isFullAccess } = useAuth();

  const [type, setType] = useState("");
  const [statusFilter, setStatusFilter] = useState("published");
  const [tab, setTab] = useState("tasks");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [rows, setRows] = useState([]);
  const filteredRows = useMemo(() => {
    const list = rows || [];
    if (statusFilter === "all") return list;
    const want = statusFilter;
    return list.filter((r) => {
      const st = (r.status || "published").toLowerCase();
      return st === want;
    });
  }, [rows, statusFilter]);


  // forms
  const [taskForm, setTaskForm] = useState({ title: "", phase: "PA-PRE", sort_order: 0 });
  const [schedForm, setSchedForm] = useState({ day_index: 1, title: "", start_time: "", end_time: "", sort_order: 0 });
  const [matForm, setMatForm] = useState({ name: "", link: "", notes: "", sort_order: 0 });
  const [toolForm, setToolForm] = useState({ name: "", link: "", print_guidance: "", print_quantity: "", sort_order: 0 });
  const [videoForm, setVideoForm] = useState({ title: "", link: "", when_to_use: "", area: "", sort_order: 0 });

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    if (user && !isFullAccess) router.replace("/dashboard");
  }, [user, loading, isFullAccess, router]);

  async function refresh() {
    setError("");
    try {
      const immersionType = type || null;
      if (tab === "tasks") setRows(await listTaskTemplates({ immersionType }));
      if (tab === "schedule") setRows(await listScheduleTemplates({ immersionType }));
      if (tab === "materials") setRows(await listMaterialTemplates({ immersionType }));
      if (tab === "tools") setRows(await listToolTemplates({ immersionType }));
      if (tab === "videos") setRows(await listVideoTemplates({ immersionType }));
    } catch (e) {
      setError(e?.message || "Erro ao carregar templates.");
    }
  }

  useEffect(() => {
    if (!user || !isFullAccess) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, type, user, isFullAccess, statusFilter]);

  const header = useMemo(() => {
    const label = tab === "tasks" ? "Tarefas" : tab === "schedule" ? "Cronograma" : tab === "materials" ? "Materiais" : tab === "tools" ? "Ferramentas" : "Vídeos";
    return `Templates • ${label}`;
  }, [tab]);

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const immersion_type = type || null;
      if (tab === "tasks") {
        await createTaskTemplate({ ...taskForm, immersion_type });
        setTaskForm({ title: "", phase: "PA-PRE", sort_order: 0 });
      }
      if (tab === "schedule") {
        await createScheduleTemplate({ ...schedForm, immersion_type, day_index: Number(schedForm.day_index || 1), sort_order: Number(schedForm.sort_order || 0) });
        setSchedForm({ day_index: 1, title: "", start_time: "", end_time: "", sort_order: 0 });
      }
      if (tab === "materials") {
        await createMaterialTemplate({ ...matForm, immersion_type, sort_order: Number(matForm.sort_order || 0) });
        setMatForm({ name: "", link: "", notes: "", sort_order: 0 });
      }
      if (tab === "tools") {
        await createToolTemplate({
          ...toolForm,
          immersion_type,
          print_quantity: toolForm.print_quantity === "" ? null : Number(toolForm.print_quantity),
          sort_order: Number(toolForm.sort_order || 0),
        });
        setToolForm({ name: "", link: "", print_guidance: "", print_quantity: "", sort_order: 0 });
      }
      if (tab === "videos") {
        await createVideoTemplate({ ...videoForm, immersion_type, sort_order: Number(videoForm.sort_order || 0) });
        setVideoForm({ title: "", link: "", when_to_use: "", area: "", sort_order: 0 });
      }
      await refresh();
    } catch (e2) {
      setError(e2?.message || "Erro ao criar template.");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(id) {
    setBusy(true);
    setError("");
    try {
      await publishTemplate(tab, id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Erro ao publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function onUnpublish(id) {
    setBusy(true);
    setError("");
    try {
      await unpublishTemplate(tab, id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Erro ao voltar para rascunho.");
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate(id) {
    setBusy(true);
    setError("");
    try {
      await duplicateTemplate(tab, id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Erro ao duplicar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Excluir este template?")) return;
    setBusy(true);
    setError("");
    try {
      if (tab === "tasks") await deleteTaskTemplate(id);
      if (tab === "schedule") await deleteScheduleTemplate(id);
      if (tab === "materials") await deleteMaterialTemplate(id);
      if (tab === "tools") await deleteToolTemplate(id);
      if (tab === "videos") await deleteVideoTemplate(id);
      await refresh();
    } catch (e) {
      setError(e?.message || "Erro ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title={header}>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="h2">Templates por tipo</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Configure o que será pré-carregado ao criar uma imersão do tipo selecionado. Se o tipo estiver vazio, o template é global.
            </div>
          </div>
          <div className="row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ minWidth: 220 }}>
              <div className="label" style={{ marginBottom: 6 }}>Tipo</div>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Global (todos)</option>
                {IMMERSION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <div className="label" style={{ marginBottom: 6 }}>Status</div>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="published">Publicado</option>
                <option value="draft">Rascunho</option>
                <option value="all">Todos</option>
              </select>
            </div>
          </div>
        </div>

        <div className="tabs" style={{ marginTop: 14 }}>
          <Tab active={tab === "tasks"} onClick={() => setTab("tasks")}>Tarefas</Tab>
          <Tab active={tab === "schedule"} onClick={() => setTab("schedule")}>Cronograma</Tab>
          <Tab active={tab === "materials"} onClick={() => setTab("materials")}>Materiais</Tab>
          <Tab active={tab === "tools"} onClick={() => setTab("tools")}>Ferramentas</Tab>
          <Tab active={tab === "videos"} onClick={() => setTab("videos")}>Vídeos</Tab>
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div> : null}

        <div className="grid2" style={{ marginTop: 14, alignItems: "start" }}>
          <div>
            <div className="h3">Adicionar</div>
            <form onSubmit={onCreate}>
              {tab === "tasks" ? (
                <>
                  <Field label="Título">
                    <input className="input" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required />
                  </Field>
                  <div className="grid2">
                    <Field label="Fase">
                      <select className="input" value={taskForm.phase} onChange={(e) => setTaskForm((p) => ({ ...p, phase: e.target.value }))}>
                        {PHASES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Ordem">
                      <input className="input" type="number" value={taskForm.sort_order} onChange={(e) => setTaskForm((p) => ({ ...p, sort_order: Number(e.target.value || 0) }))} />
                    </Field>
                  </div>
                </>
              ) : null}

              {tab === "schedule" ? (
                <>
                  <div className="grid2">
                    <Field label="Dia (índice)">
                      <input className="input" type="number" min="1" value={schedForm.day_index} onChange={(e) => setSchedForm((p) => ({ ...p, day_index: e.target.value }))} />
                    </Field>
                    <Field label="Ordem">
                      <input className="input" type="number" value={schedForm.sort_order} onChange={(e) => setSchedForm((p) => ({ ...p, sort_order: e.target.value }))} />
                    </Field>
                  </div>
                  <Field label="Título">
                    <input className="input" value={schedForm.title} onChange={(e) => setSchedForm((p) => ({ ...p, title: e.target.value }))} required />
                  </Field>
                  <div className="grid2">
                    <Field label="Início">
                      <input className="input" type="time" value={schedForm.start_time} onChange={(e) => setSchedForm((p) => ({ ...p, start_time: e.target.value }))} />
                    </Field>
                    <Field label="Fim">
                      <input className="input" type="time" value={schedForm.end_time} onChange={(e) => setSchedForm((p) => ({ ...p, end_time: e.target.value }))} />
                    </Field>
                  </div>
                </>
              ) : null}

              {tab === "materials" ? (
                <>
                  <Field label="Nome">
                    <input className="input" value={matForm.name} onChange={(e) => setMatForm((p) => ({ ...p, name: e.target.value }))} required />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={matForm.link} onChange={(e) => setMatForm((p) => ({ ...p, link: e.target.value }))} placeholder="URL" />
                  </Field>
                  <Field label="Observações">
                    <textarea className="input" rows={2} value={matForm.notes} onChange={(e) => setMatForm((p) => ({ ...p, notes: e.target.value }))} />
                  </Field>
                  <Field label="Ordem">
                    <input className="input" type="number" value={matForm.sort_order} onChange={(e) => setMatForm((p) => ({ ...p, sort_order: e.target.value }))} />
                  </Field>
                </>
              ) : null}

              {tab === "tools" ? (
                <>
                  <Field label="Nome">
                    <input className="input" value={toolForm.name} onChange={(e) => setToolForm((p) => ({ ...p, name: e.target.value }))} required />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={toolForm.link} onChange={(e) => setToolForm((p) => ({ ...p, link: e.target.value }))} placeholder="URL" />
                  </Field>
                  <Field label="Orientação de impressão">
                    <input className="input" value={toolForm.print_guidance} onChange={(e) => setToolForm((p) => ({ ...p, print_guidance: e.target.value }))} />
                  </Field>
                  <div className="grid2">
                    <Field label="Quantidade">
                      <input className="input" type="number" value={toolForm.print_quantity} onChange={(e) => setToolForm((p) => ({ ...p, print_quantity: e.target.value }))} />
                    </Field>
                    <Field label="Ordem">
                      <input className="input" type="number" value={toolForm.sort_order} onChange={(e) => setToolForm((p) => ({ ...p, sort_order: e.target.value }))} />
                    </Field>
                  </div>
                </>
              ) : null}

              {tab === "videos" ? (
                <>
                  <Field label="Título">
                    <input className="input" value={videoForm.title} onChange={(e) => setVideoForm((p) => ({ ...p, title: e.target.value }))} required />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={videoForm.link} onChange={(e) => setVideoForm((p) => ({ ...p, link: e.target.value }))} placeholder="URL" />
                  </Field>
                  <Field label="Quando usar">
                    <input className="input" value={videoForm.when_to_use} onChange={(e) => setVideoForm((p) => ({ ...p, when_to_use: e.target.value }))} />
                  </Field>
                  <div className="grid2">
                    <Field label="Área">
                      <input className="input" value={videoForm.area} onChange={(e) => setVideoForm((p) => ({ ...p, area: e.target.value }))} />
                    </Field>
                    <Field label="Ordem">
                      <input className="input" type="number" value={videoForm.sort_order} onChange={(e) => setVideoForm((p) => ({ ...p, sort_order: e.target.value }))} />
                    </Field>
                  </div>
                </>
              ) : null}

              <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 6 }}>
                {busy ? "Salvando..." : "Adicionar"}
              </button>
            </form>
          </div>

          <div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h3">Lista</div>
              <button className="btn" type="button" onClick={refresh} disabled={busy}>Atualizar</button>
            </div>

            <div className="tableWrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Título</th>
                    {tab === "tasks" ? <th>Fase</th> : null}
                    {tab === "schedule" ? <th>Dia</th> : null}
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Versão</th>
                    <th style={{ width: 230 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredRows || []).map((r) => (
                    <tr key={r.id}>
                      <td>{r.title || r.name}</td>
                      {tab === "tasks" ? <td><span className="badge">{r.phase}</span></td> : null}
                      {tab === "schedule" ? <td>{r.day_index || ""}</td> : null}
                      <td>{r.immersion_type || "Global"}</td>
                      <td><span className={((r.status||"published")==="published")?"badge success":"badge"}>{(r.status||"published")==="published"?"Publicado":"Rascunho"}</span></td>
                      <td>{r.version || 1}</td>
                      <td>
                        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                          {(r.status || "published") === "draft" ? (
                            <button className="btn primary" type="button" onClick={() => onPublish(r.id)} disabled={busy}>Publicar</button>
                          ) : (
                            <button className="btn" type="button" onClick={() => onUnpublish(r.id)} disabled={busy}>Rascunho</button>
                          )}
                          <button className="btn" type="button" onClick={() => onDuplicate(r.id)} disabled={busy}>Duplicar</button>
                          <button className="btn" type="button" onClick={() => onDelete(r.id)} disabled={busy}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows?.length ? (
                    <tr>
                      <td colSpan={tab === "tasks" || tab === "schedule" ? 7 : 6} className="small muted">Nenhum template encontrado.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="small muted" style={{ marginTop: 10 }}>
              Dica: deixe templates globais para itens comuns a todos os tipos; use o filtro de tipo para especializar.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
