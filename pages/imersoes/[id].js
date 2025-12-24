import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { deleteImmersion, getImmersion, updateImmersion } from "../../lib/immersions";
import { listTasksByImmersion, createTask, updateTask, deleteTask } from "../../lib/tasks";
import { listActiveProfiles } from "../../lib/profiles";
import { canEditTask, roleLabel } from "../../lib/permissions";
import { createEvidenceSignedUrl, uploadEvidenceFile } from "../../lib/storage";
import { listCosts, createCost, updateCost, deleteCost } from "../../lib/costs";
import { listScheduleItems, createScheduleItem, updateScheduleItem, deleteScheduleItem } from "../../lib/schedule";
import { listTools, createTool, updateTool, deleteTool } from "../../lib/tools";
import { listMaterials, createMaterial, updateMaterial, deleteMaterial } from "../../lib/materials";
import { listVideos, createVideo, updateVideo, deleteVideo } from "../../lib/videos";
import { listPdcaItems, createPdcaItem, updatePdcaItem, deletePdcaItem } from "../../lib/pdca";



const ROOMS = ["Brasil", "São Paulo", "PodCast"];
const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];

const TASK_STATUSES = ["Programada", "Em andamento", "Concluída"];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {hint ? (
        <div className="small" style={{ marginBottom: 6 }}>
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabRow">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={active === t.key ? "tabBtn active" : "tabBtn"}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Converte qualquer data recebida (YYYY-MM-DD ou ISO) para "somente data" no horário local
function toLocalDateOnly(d) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysUntil(startDateValue) {
  if (!startDateValue) return null;

  const start = toLocalDateOnly(startDateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = start.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Farol por dias
function getCountdownSignal(days) {
  if (days === null) return null;

  // Hoje ou passado => crítico
  if (days <= 0) {
    return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } }; // bordo
  }

  // Faixas (ajustáveis)
  if (days >= 60) return { label: `${days} dias`, style: { background: "#0d3b1e", borderColor: "#1b6b36" } }; // verde
  if (days >= 40) return { label: `${days} dias`, style: { background: "#0b2b52", borderColor: "#1f4f99" } }; // azul
  if (days >= 30) return { label: `${days} dias`, style: { background: "#071a35", borderColor: "#163a7a" } }; // azul escuro
  if (days >= 20) return { label: `${days} dias`, style: { background: "#4a2a00", borderColor: "#b86b00" } }; // laranja
  if (days >= 10) return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } }; // bordo

  // 1 a 9 dias => bordo
  return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
}

function isLate(dueDateStr, status) {
  if (!dueDateStr) return false;
  if (status === "Concluída") return false;
  const due = toLocalDateOnly(dueDateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}

export default function ImmersionDetailEditPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess, role, profile } = useAuth();
  const { id } = router.query;

  const full = isFullAccess;

  const [tab, setTab] = useState("essencial");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(null);

  // Checklist
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

  // criação de tarefa
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    phase: "PA-PRE",
    area: "eventos",
    title: "",
    responsible_id: "",
    due_date: "",
    status: "Programada",
    done_at: "",
    notes: "",
    evidence_link: "",
    evidence_path: ""
  });

  // Seções da planilha
  const [costs, setCosts] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [tools, setTools] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [videos, setVideos] = useState([]);
  const [pdcaItems, setPdcaItems] = useState([]);

  const [sectionsLoading, setSectionsLoading] = useState(false);

  const [editModal, setEditModal] = useState({ type: "", open: false, item: null });
  const [editDraft, setEditDraft] = useState({});

  const tabs = useMemo(
    () => [
      { key: "essencial", label: "Essencial" },
      { key: "informacoes", label: "Informações" },
      { key: "cronograma", label: "Cronograma" },
      { key: "custos", label: "Custos" },
      { key: "ferramentas", label: "Ferramentas" },
      { key: "materiais", label: "Materiais" },
      { key: "videos", label: "Vídeos" },
      { key: "pdca", label: "PDCA" },
      { key: "operacao", label: "Operação" },
      { key: "narrativa", label: "Narrativa" },
      { key: "trainer", label: "Trainer" },
      { key: "terceiros", label: "Terceiros" },
      { key: "checklist", label: "Checklist" }
    ],
    []
  );

  // Protege a rota (MVP)
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Carrega imersão
  useEffect(() => {
    if (authLoading || !user) return;

    if (!id || typeof id !== "string") return;
    let mounted = true;

    async function load() {
      try {
        setError("");
        setLoading(true);
        const data = await getImmersion(id);
        if (mounted) setForm(data);
      } catch (e) {
        if (mounted) setError(e?.message || "Falha ao carregar a imersão.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [authLoading, user, id]);

  // Carrega usuários ativos (profiles) para o dropdown de responsável
  useEffect(() => {
    let mounted = true;
    if (!isFullAccess) { setProfiles([]); return () => { mounted = false; }; }

    async function loadProfiles() {
      try {
        const data = await listActiveProfiles();
        if (!mounted) return;

        setProfiles(data);

        // Define automaticamente o primeiro usuário como responsável padrão
        if (data.length > 0) {
          setNewTask((prev) => ({ ...prev, responsible_id: data[0].id }));
        }
      } catch (e) {
        console.error(e);
      }
    }

    loadProfiles();
    return () => {
      mounted = false;
    };
  }, [isFullAccess]);

  async function loadTasks(immersionId) {
    setTaskError("");
    setTasksLoading(true);
    try {
      const data = await listTasksByImmersion(immersionId);
      setTasks(data);
    } catch (e) {
      setTaskError(e?.message || "Falha ao carregar checklist.");
    } finally {
      setTasksLoading(false);
    }
  }


  async function loadSections(immersionId) {
    setSectionsLoading(true);
    try {
      const [c, s, t, m, v, p] = await Promise.all([
        listCosts(immersionId),
        listScheduleItems(immersionId),
        listTools(immersionId),
        listMaterials(immersionId),
        listVideos(immersionId),
        listPdcaItems(immersionId)
      ]);
      setCosts(c);
      setScheduleItems(s);
      setTools(t);
      setMaterials(m);
      setVideos(v);
      setPdcaItems(p);
    } catch (e) {
      // erros individuais aparecem ao tentar salvar; aqui evitamos travar a tela
      console.error(e);
    } finally {
      setSectionsLoading(false);
    }
  }

  // Carrega todas as seções (planilha) ao abrir a imersão
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    loadSections(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Carrega tasks quando entra na aba Checklist
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    if (tab !== "checklist") return;
    loadTasks(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function openEdit(type, item = null) {
    setEditModal({ type, open: true, item });
    setEditDraft(item ? { ...item } : {});
  }

  function closeEdit() {
    setEditModal({ type: "", open: false, item: null });
    setEditDraft({});
  }

  async function saveEdit() {
    if (!id || typeof id !== "string") return;
    const type = editModal?.type;
    try {
      if (type === "cost") {
        const payload = {
          immersion_id: id,
          category: editDraft.category || null,
          item: (editDraft.item || "").trim(),
          value: editDraft.value === "" || editDraft.value === null || typeof editDraft.value === "undefined" ? null : Number(editDraft.value),
          description: editDraft.description || null
        };
        if (!payload.item) return setError("Preencha o item do custo.");
        if (editModal.item?.id) await updateCost(editModal.item.id, payload);
        else await createCost(payload);
      }

      if (type === "schedule") {
        const payload = {
          immersion_id: id,
          day_label: editDraft.day_label || null,
          day_date: editDraft.day_date || null,
          start_time: editDraft.start_time || null,
          end_time: editDraft.end_time || null,
          duration_minutes: editDraft.duration_minutes === "" || editDraft.duration_minutes === null || typeof editDraft.duration_minutes === "undefined" ? null : Number(editDraft.duration_minutes),
          activity_type: editDraft.activity_type || null,
          topics: editDraft.topics || null,
          responsible: editDraft.responsible || null,
          link: editDraft.link || null,
          staff_notes: editDraft.staff_notes || null,
          sort_order: editDraft.sort_order === "" || editDraft.sort_order === null || typeof editDraft.sort_order === "undefined" ? 0 : Number(editDraft.sort_order)
        };
        if (editModal.item?.id) await updateScheduleItem(editModal.item.id, payload);
        else await createScheduleItem(payload);
      }

      if (type === "tool") {
        const payload = {
          immersion_id: id,
          name: (editDraft.name || "").trim(),
          link: editDraft.link || null,
          print_guidance: editDraft.print_guidance || null,
          print_quantity: editDraft.print_quantity === "" || editDraft.print_quantity === null || typeof editDraft.print_quantity === "undefined" ? null : Number(editDraft.print_quantity)
        };
        if (!payload.name) return setError("Preencha o nome da ferramenta.");
        if (editModal.item?.id) await updateTool(editModal.item.id, payload);
        else await createTool(payload);
      }

      if (type === "material") {
        const payload = {
          immersion_id: id,
          material: (editDraft.material || "").trim(),
          link: editDraft.link || null,
          quantity: editDraft.quantity === "" || editDraft.quantity === null || typeof editDraft.quantity === "undefined" ? null : Number(editDraft.quantity),
          specification: editDraft.specification || null,
          reference: editDraft.reference || null
        };
        if (!payload.material) return setError("Preencha o material.");
        if (editModal.item?.id) await updateMaterial(editModal.item.id, payload);
        else await createMaterial(payload);
      }

      if (type === "video") {
        const payload = {
          immersion_id: id,
          title: (editDraft.title || "").trim(),
          when_to_use: editDraft.when_to_use || null,
          link: editDraft.link || null,
          area: editDraft.area || null
        };
        if (!payload.title) return setError("Preencha o título do vídeo.");
        if (editModal.item?.id) await updateVideo(editModal.item.id, payload);
        else await createVideo(payload);
      }

      if (type === "pdca") {
        const payload = {
          immersion_id: id,
          classification: editDraft.classification || null,
          situation: editDraft.situation || null,
          reporter: editDraft.reporter || null,
          area_involved: editDraft.area_involved || null,
          notes: editDraft.notes || null
        };
        if (editModal.item?.id) await updatePdcaItem(editModal.item.id, payload);
        else await createPdcaItem(payload);
      }

      await loadSections(id);
      closeEdit();
    } catch (e) {
      setError(e?.message || "Falha ao salvar item.");
    }
  }

  async function deleteEditItem() {
    if (!id || typeof id !== "string") return;
    const type = editModal?.type;
    const itemId = editModal?.item?.id;
    if (!itemId) return;
    try {
      if (type === "cost") await deleteCost(itemId);
      if (type === "schedule") await deleteScheduleItem(itemId);
      if (type === "tool") await deleteTool(itemId);
      if (type === "material") await deleteMaterial(itemId);
      if (type === "video") await deleteVideo(itemId);
      if (type === "pdca") await deletePdcaItem(itemId);

      await loadSections(id);
      closeEdit();
    } catch (e) {
      setError(e?.message || "Falha ao excluir item.");
    }
  }

  function onDraft(field, value) {
    setEditDraft((p) => ({ ...p, [field]: value }));
  }

  function deadlineStatus(task) {
    const due = task?.due_date ? new Date(task.due_date + "T00:00:00") : null;
    const done = task?.done_at ? new Date(task.done_at + "T00:00:00") : null;
    if (!due) return { label: "—", kind: "muted" };

    if (task?.status === "Concluída" || done) {
      if (!done) return { label: "Concluída", kind: "ok" };
      return done.getTime() <= due.getTime() ? { label: "No prazo", kind: "ok" } : { label: "Fora do prazo", kind: "warn" };
    }

    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.ceil((due.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: "Atrasada", kind: "danger" };
    if (diffDays === 0) return { label: "Vence hoje", kind: "warn" };
    if (diffDays <= 3) return { label: `Vence em ${diffDays}d`, kind: "warn" };
    return { label: `Em dia (${diffDays}d)`, kind: "ok" };
  }


  async function onSaveImmersion(e) {
    e.preventDefault();
    if (!form) return;

    if (!full) {
      setError("Sem permissão para editar esta imersão.");
      return;
    }

    setError("");

    if (!form.immersion_name?.trim()) return setError("Preencha o nome da imersão.");
    if (!form.start_date) return setError("Preencha a data de início.");
    if (!form.end_date) return setError("Preencha a data de fim.");
    if (form.need_specific_staff && !(form.staff_justification || "").trim()) {
      return setError("Como staff específico = Sim, preencha a justificativa.");
    }

    try {
      setSaving(true);
      await updateImmersion(form.id, {
        immersion_name: form.immersion_name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: form.status,

        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,

        service_order_link: form.service_order_link,
        technical_sheet_link: form.technical_sheet_link,

        mentors_present: form.mentors_present,
        need_specific_staff: form.need_specific_staff,
        staff_justification: form.need_specific_staff ? form.staff_justification : "",

        immersion_narrative: form.immersion_narrative,
        narrative_information: form.narrative_information,
        dynamics_information: form.dynamics_information,

        trainer_main_information: form.trainer_main_information,
        vignette_name: form.vignette_name,
        vignette_text: form.vignette_text,
        contract_link: form.contract_link,
        photos_link: form.photos_link,
        authority_video_link: form.authority_video_link,
        professional_summary: form.professional_summary,
        instagram_profile: form.instagram_profile,
        food_preferences_rider: form.food_preferences_rider,
        important_observations: form.important_observations,
        place_of_residence: form.place_of_residence,

        need_third_parties: form.need_third_parties,
        third_party_speech_therapist: form.third_party_speech_therapist,
        third_party_barber: form.third_party_barber,
        third_party_hairdresser: form.third_party_hairdresser,
        third_party_makeup: form.third_party_makeup,

        will_have_speaker: form.will_have_speaker
      });

      alert("Alterações salvas.");
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteImmersion() {
    if (!form) return;

    if (!full) {
      setError("Sem permissão para excluir esta imersão.");
      return;
    }

    const ok = confirm("Tem certeza que deseja excluir esta imersão? Essa ação não pode ser desfeita.");
    if (!ok) return;

    try {
      setRemoving(true);
      await deleteImmersion(form.id);
      router.push("/imersoes");
    } catch (e) {
      setError(e?.message || "Falha ao excluir.");
    } finally {
      setRemoving(false);
    }
  }

  // Checklist helpers
  const profileById = useMemo(() => {
    const map = new Map();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const tasksByPhase = useMemo(() => {
    const map = { "PA-PRE": [], "DURANTE": [], "POS": [] };
    for (const t of tasks) {
      if (map[t.phase]) map[t.phase].push(t);
    }
    return map;
  }, [tasks]);

  const checklistSummary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Concluída").length;
    const late = tasks.filter((t) => isLate(t.due_date, t.status)).length;
    return { total, done, late };
  }, [tasks]);

  async function onCreateTask() {
    if (!id || typeof id !== "string") return;

    if (!full) {
      setTaskError("Sem permissão para criar tarefas.");
      return;
    }

    setTaskError("");

    if (!newTask.title.trim()) {
      setTaskError("Preencha o título da tarefa.");
      return;
    }

    try {
      setTaskSaving(true);
      await createTask({
        immersion_id: id,
        phase: newTask.phase,
        area: newTask.area || null,
        title: newTask.title.trim(),
        responsible_id: newTask.responsible_id || null,
        due_date: newTask.due_date || null,
        done_at: newTask.done_at || null,
        notes: (newTask.notes || "").trim() || null,
        status: newTask.status,
        evidence_link: newTask.evidence_link || null,
        evidence_path: newTask.evidence_path || null
      });

      setNewTaskOpen(false);
      setNewTask((p) => ({ ...p, title: "", due_date: "", done_at: "", notes: "", evidence_link: "", evidence_path: "", status: "Programada" }));
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao criar tarefa.");
    } finally {
      setTaskSaving(false);
    }
  }

  async function onQuickUpdateTask(task, patch) {
    const allowed = canEditTask({ role, userId: user?.id, taskResponsibleId: task?.responsible_id }) || full;
    if (!allowed) {
      setTaskError(`Sem permissão para editar tarefas da área ${task?.area || "-"}.`);
      return;
    }
    setTaskError("");
    try {
      const normalized = { ...patch };
      if (Object.prototype.hasOwnProperty.call(normalized, "done_at") && !normalized.done_at) normalized.done_at = null;
      if (Object.prototype.hasOwnProperty.call(normalized, "notes") && typeof normalized.notes === "string") normalized.notes = normalized.notes.trim() || null;
      await updateTask(task.id, normalized);
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao atualizar tarefa.");
    }
  }

  async function onUploadEvidence(task, file) {
    const allowed = canEditTask({ role, userId: user?.id, taskResponsibleId: task?.responsible_id }) || full;
    if (!allowed) {
      setTaskError(`Sem permissão para enviar evidência na área ${task?.area || "-"}.`);
      return;
    }
    setTaskError("");
    try {
      setTaskSaving(true);
      const { path } = await uploadEvidenceFile({ file, immersionId: id, taskId: task.id });
      await updateTask(task.id, { evidence_path: path });
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao enviar evidência.");
    } finally {
      setTaskSaving(false);
    }
  }

  async function onOpenUploadedEvidence(task) {
    if (!task?.evidence_path) return;
    setTaskError("");
    try {
      const url = await createEvidenceSignedUrl(task.evidence_path, 3600);
      if (!url) throw new Error("Não foi possível gerar o link do arquivo.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setTaskError(e?.message || "Falha ao abrir evidência.");
    }
  }

  async function onDeleteTask(taskId) {
    if (!full) {
      setTaskError("Sem permissão para excluir tarefas.");
      return;
    }
    const ok = confirm("Excluir esta tarefa?");
    if (!ok) return;
    setTaskError("");

    try {
      await deleteTask(taskId);
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao excluir tarefa.");
    }
  }

  const staffEnabled = form?.need_specific_staff === true;
  const speakerEnabled = form?.will_have_speaker === true;

  const d = daysUntil(form?.start_date);
  const signal = getCountdownSignal(d);

  return (
    <Layout title="Editar imersão">
      <div className="card" style={{ marginBottom: 12 }}>
        {loading ? (
          <div className="small">Carregando...</div>
        ) : form ? (
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="h1" style={{ margin: 0 }}>
                {form.immersion_name}
              </div>
              <div className="small">
                {form.start_date} → {form.end_date} • Sala: {form.room_location || "-"} • Status: {form.status}
              </div>
            </div>

            <div className="row">
              {signal ? (
                <span
                  className="badge"
                  style={{
                    ...signal.style,
                    border: "1px solid",
                    padding: "6px 10px",
                    borderRadius: 999
                  }}
                  title="Dias até a data de início"
                >
                  {signal.label} até
                </span>
              ) : null}

              <button type="button" className="btn danger" onClick={onDeleteImmersion} disabled={removing}>
                {removing ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        ) : (
          <div className="small">Imersão não encontrada.</div>
        )}
      </div>

      <form className="card" onSubmit={onSaveImmersion}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {}

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        {!form ? <div className="small">Nada para editar.</div> : null}

        <fieldset disabled={!full} style={{ border: 0, padding: 0, margin: 0 }}>
        {form && tab === "essencial" ? (
          <>
            <div className="h2">Identificação</div>

            <Field label="Imersão">
              <input className="input" value={form.immersion_name || ""} onChange={(e) => set("immersion_name", e.target.value)} />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Data de início">
                  <input className="input" type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
                </Field>
              </div>

              <div className="col">
                <Field label="Data de fim">
                  <input className="input" type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
                </Field>
              </div>
            </div>

            <Field label="Sala a ser realizada">
              <select className="input" value={form.room_location || "Brasil"} onChange={(e) => set("room_location", e.target.value)}>
                {ROOMS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select className="input" value={form.status || "Planejamento"} onChange={(e) => set("status", e.target.value)}>
                <option value="Planejamento">Planejamento</option>
                <option value="Em execução">Em execução</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </Field>
          </>
        ) : null}

        
        {form && tab === "informacoes" ? (
          <>
            <div className="h2">Informações da imersão</div>

            <div className="grid2">
              <Field label="Formato">
                <input className="input" value={form.format || ""} onChange={(e) => set("format", e.target.value)} placeholder="Ex.: Presencial / Híbrido / Online" />
              </Field>

              <Field label="Time de educação responsável">
                <input className="input" value={form.education_team || ""} onChange={(e) => set("education_team", e.target.value)} />
              </Field>

              <Field label="Mentores presentes">
                <input className="input" value={form.mentors || ""} onChange={(e) => set("mentors", e.target.value)} placeholder="Nomes ou papéis" />
              </Field>

              <Field label="Necessita staff específico?">
                <label className="row" style={{ gap: 10 }}>
                  <input type="checkbox" checked={!!form.staff_needed} onChange={(e) => set("staff_needed", e.target.checked)} />
                  <span className="small">Sim</span>
                </label>
              </Field>

              <Field label="Justificativa (staff)">
                <textarea className="input" rows={3} value={form.staff_justification || ""} onChange={(e) => set("staff_justification", e.target.value)} />
              </Field>

              <Field label="Ordem de Serviço (link)">
                <input className="input" value={form.os_link || ""} onChange={(e) => set("os_link", e.target.value)} placeholder="https://..." />
              </Field>

              <Field label="Ficha Técnica (link)">
                <input className="input" value={form.tech_sheet_link || ""} onChange={(e) => set("tech_sheet_link", e.target.value)} placeholder="https://..." />
              </Field>
            </div>

            <div className="h2" style={{ marginTop: 18 }}>Narrativa e dinâmicas</div>

            <Field label="Título / eixo de narrativa">
              <input className="input" value={form.narrative_title || ""} onChange={(e) => set("narrative_title", e.target.value)} />
            </Field>

            <Field label="Informações para narrativa">
              <textarea className="input" rows={5} value={form.narrative_text || ""} onChange={(e) => set("narrative_text", e.target.value)} />
            </Field>

            <Field label="Informações para dinâmicas">
              <textarea className="input" rows={5} value={form.dynamics_text || ""} onChange={(e) => set("dynamics_text", e.target.value)} />
            </Field>
          </>
        ) : null}

        {form && tab === "cronograma" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>Cronograma</div>
              <button type="button" className="btn primary" onClick={() => openEdit("schedule", null)} disabled={!full}>
                Novo item
              </button>
            </div>

            <div className="small" style={{ color: "var(--muted)", marginBottom: 10 }}>
              Dica: use "Dia (label)" para separar por DIA 1, DIA 2, etc. A "Ordem" ajuda na ordenação quando não houver horário.
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Data</th>
                    <th>Início</th>
                    <th>Término</th>
                    <th>Tempo</th>
                    <th>Tipo</th>
                    <th>Temas</th>
                    <th>Responsável</th>
                    <th>Link</th>
                    <th>Orientações</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(scheduleItems || []).map((it) => (
                    <tr key={it.id}>
                      <td>{it.day_label || "—"}</td>
                      <td>{it.day_date || "—"}</td>
                      <td>{it.start_time || "—"}</td>
                      <td>{it.end_time || "—"}</td>
                      <td>{typeof it.duration_minutes === "number" ? `${it.duration_minutes}m` : "—"}</td>
                      <td>{it.activity_type || "—"}</td>
                      <td className="cellWrap">{it.topics || "—"}</td>
                      <td>{it.responsible || "—"}</td>
                      <td className="cellWrap">{it.link ? <a href={it.link} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                      <td className="cellWrap">{it.staff_notes || "—"}</td>
                      <td>
                        <button type="button" className="btn" onClick={() => openEdit("schedule", it)} disabled={!full}>Editar</button>
                      </td>
                    </tr>
                  ))}
                  {(scheduleItems || []).length === 0 ? (
                    <tr><td colSpan={11} className="small" style={{ color: "var(--muted)" }}>Sem itens cadastrados.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {form && tab === "custos" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>Custos</div>
              <button type="button" className="btn primary" onClick={() => openEdit("cost", null)} disabled={!full}>
                Novo custo
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Item</th>
                    <th>Valor</th>
                    <th>Descrição</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(costs || []).map((c) => (
                    <tr key={c.id}>
                      <td>{c.category || "—"}</td>
                      <td>{c.item}</td>
                      <td>{typeof c.value === "number" ? c.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                      <td className="cellWrap">{c.description || "—"}</td>
                      <td><button type="button" className="btn" onClick={() => openEdit("cost", c)} disabled={!full}>Editar</button></td>
                    </tr>
                  ))}
                  {(costs || []).length === 0 ? (
                    <tr><td colSpan={5} className="small" style={{ color: "var(--muted)" }}>Sem custos cadastrados.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="small" style={{ color: "var(--muted)" }}>Total</div>
                <div className="h2" style={{ margin: 0 }}>
                  {(costs || []).reduce((acc, c) => acc + (typeof c.value === "number" ? c.value : 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {form && tab === "ferramentas" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>Ferramentas</div>
              <button type="button" className="btn primary" onClick={() => openEdit("tool", null)} disabled={!full}>
                Nova ferramenta
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ferramenta</th>
                    <th>Link</th>
                    <th>Orientações</th>
                    <th>Qtd.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(tools || []).map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.link ? <a href={t.link} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                      <td className="cellWrap">{t.print_guidance || "—"}</td>
                      <td>{typeof t.print_quantity === "number" ? t.print_quantity : "—"}</td>
                      <td><button type="button" className="btn" onClick={() => openEdit("tool", t)} disabled={!full}>Editar</button></td>
                    </tr>
                  ))}
                  {(tools || []).length === 0 ? (
                    <tr><td colSpan={5} className="small" style={{ color: "var(--muted)" }}>Sem ferramentas cadastradas.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {form && tab === "materiais" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>Materiais</div>
              <button type="button" className="btn primary" onClick={() => openEdit("material", null)} disabled={!full}>
                Novo material
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Link</th>
                    <th>Qtd.</th>
                    <th>Especificação</th>
                    <th>Referência</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(materials || []).map((m) => (
                    <tr key={m.id}>
                      <td>{m.material}</td>
                      <td>{m.link ? <a href={m.link} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                      <td>{m.quantity ?? "—"}</td>
                      <td className="cellWrap">{m.specification || "—"}</td>
                      <td className="cellWrap">{m.reference || "—"}</td>
                      <td><button type="button" className="btn" onClick={() => openEdit("material", m)} disabled={!full}>Editar</button></td>
                    </tr>
                  ))}
                  {(materials || []).length === 0 ? (
                    <tr><td colSpan={6} className="small" style={{ color: "var(--muted)" }}>Sem materiais cadastrados.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {form && tab === "videos" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>Vídeos</div>
              <button type="button" className="btn primary" onClick={() => openEdit("video", null)} disabled={!full}>
                Novo vídeo
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vídeo</th>
                    <th>Quando usar</th>
                    <th>Link</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(videos || []).map((v) => (
                    <tr key={v.id}>
                      <td>{v.title}</td>
                      <td className="cellWrap">{v.when_to_use || "—"}</td>
                      <td>{v.link ? <a href={v.link} target="_blank" rel="noreferrer">Abrir</a> : "—"}</td>
                      <td>{v.area || "—"}</td>
                      <td><button type="button" className="btn" onClick={() => openEdit("video", v)} disabled={!full}>Editar</button></td>
                    </tr>
                  ))}
                  {(videos || []).length === 0 ? (
                    <tr><td colSpan={5} className="small" style={{ color: "var(--muted)" }}>Sem vídeos cadastrados.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {form && tab === "pdca" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="h2" style={{ margin: 0 }}>PDCA</div>
              <button type="button" className="btn primary" onClick={() => openEdit("pdca", null)} disabled={!full}>
                Novo relato
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Classificação</th>
                    <th>Situação</th>
                    <th>Dono(a)</th>
                    <th>Observações</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(pdcaItems || []).map((p) => (
                    <tr key={p.id}>
                      <td>{p.classification || "—"}</td>
                      <td className="cellWrap">{p.situation || "—"}</td>
                      <td>{p.reporter || "—"}</td>
                      <td className="cellWrap">{p.notes || "—"}</td>
                      <td><button type="button" className="btn" onClick={() => openEdit("pdca", p)} disabled={!full}>Editar</button></td>
                    </tr>
                  ))}
                  {(pdcaItems || []).length === 0 ? (
                    <tr><td colSpan={6} className="small" style={{ color: "var(--muted)" }}>Sem registros.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

{form && tab === "operacao" ? (
          <>
            <div className="h2">Time e links</div>

            <div className="row">
              <div className="col">
                <Field label="Consultor educacional">
                  <input className="input" value={form.educational_consultant || ""} onChange={(e) => set("educational_consultant", e.target.value)} />
                </Field>
              </div>

              <div className="col">
                <Field label="Designer instrucional">
                  <input className="input" value={form.instructional_designer || ""} onChange={(e) => set("instructional_designer", e.target.value)} />
                </Field>
              </div>
            </div>

            <Field label="Link ordem de serviço">
              <input className="input" value={form.service_order_link || ""} onChange={(e) => set("service_order_link", e.target.value)} />
            </Field>

            <Field label="Link para ficha técnica">
              <input className="input" value={form.technical_sheet_link || ""} onChange={(e) => set("technical_sheet_link", e.target.value)} />
            </Field>

            <div style={{ height: 10 }} />
            <div className="h2">Mentores e staff</div>

            <Field label="Mentores que estarão presentes">
              <textarea className="input" rows={4} value={form.mentors_present || ""} onChange={(e) => set("mentors_present", e.target.value)} />
            </Field>

            <Field label="Existe a necessidade de staff específico para essa imersão?">
              <div className="row">
                <button type="button" className={`btn ${form.need_specific_staff ? "primary" : ""}`} onClick={() => set("need_specific_staff", true)}>
                  Sim
                </button>
                <button
                  type="button"
                  className={`btn ${!form.need_specific_staff ? "primary" : ""}`}
                  onClick={() => {
                    set("need_specific_staff", false);
                    set("staff_justification", "");
                  }}
                >
                  Não
                </button>
              </div>
            </Field>

            <Field label="Justificativa" hint={staffEnabled ? "Obrigatório quando staff específico = Sim." : "Habilita ao marcar Sim."}>
              <textarea
                className="input"
                rows={3}
                disabled={!staffEnabled}
                value={form.staff_justification || ""}
                onChange={(e) => set("staff_justification", e.target.value)}
              />
            </Field>

            <Field label="Vai ter palestrante?">
              <div className="row">
                <button type="button" className={`btn ${speakerEnabled ? "primary" : ""}`} onClick={() => set("will_have_speaker", true)}>
                  Sim
                </button>
                <button type="button" className={`btn ${!speakerEnabled ? "primary" : ""}`} onClick={() => set("will_have_speaker", false)}>
                  Não
                </button>
              </div>

              {speakerEnabled ? (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="h2">Cadastro de palestrante (em desenvolvimento)</div>
                  <div className="small" style={{ marginBottom: 10 }}>
                    No futuro, aqui vamos cadastrar o palestrante e vincular nesta imersão.
                  </div>
                  <button type="button" className="btn" onClick={() => alert("Em desenvolvimento: cadastro de palestrante.")}>
                    Cadastrar palestrante (futuro)
                  </button>
                </div>
              ) : null}
            </Field>
          </>
        ) : null}

        {form && tab === "narrativa" ? (
          <>
            <div className="h2">Narrativa e dinâmicas</div>

            <Field label="Narrativa da imersão">
              <textarea className="input" rows={4} value={form.immersion_narrative || ""} onChange={(e) => set("immersion_narrative", e.target.value)} />
            </Field>

            <Field label="Informações para narrativa">
              <textarea className="input" rows={4} value={form.narrative_information || ""} onChange={(e) => set("narrative_information", e.target.value)} />
            </Field>

            <Field label="Informações para dinâmicas">
              <textarea className="input" rows={4} value={form.dynamics_information || ""} onChange={(e) => set("dynamics_information", e.target.value)} />
            </Field>
          </>
        ) : null}

        {form && tab === "trainer" ? (
          <>
            <div className="h2">Trainer principal</div>

            <Field label="Informações sobre o trainer principal">
              <textarea className="input" rows={4} value={form.trainer_main_information || ""} onChange={(e) => set("trainer_main_information", e.target.value)} />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Nome para vinheta">
                  <input className="input" value={form.vignette_name || ""} onChange={(e) => set("vignette_name", e.target.value)} />
                </Field>
              </div>

              <div className="col">
                <Field label="Perfil Instagram">
                  <input className="input" value={form.instagram_profile || ""} onChange={(e) => set("instagram_profile", e.target.value)} />
                </Field>
              </div>
            </div>

            <Field label="Texto para vinheta">
              <textarea className="input" rows={3} value={form.vignette_text || ""} onChange={(e) => set("vignette_text", e.target.value)} />
            </Field>

            <Field label="Contrato (link)">
              <input className="input" value={form.contract_link || ""} onChange={(e) => set("contract_link", e.target.value)} />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Link para fotos">
                  <input className="input" value={form.photos_link || ""} onChange={(e) => set("photos_link", e.target.value)} />
                </Field>
              </div>

              <div className="col">
                <Field label="Link para vídeo de autoridade">
                  <input className="input" value={form.authority_video_link || ""} onChange={(e) => set("authority_video_link", e.target.value)} />
                </Field>
              </div>
            </div>

            <Field label="Resumo profissional">
              <textarea className="input" rows={4} value={form.professional_summary || ""} onChange={(e) => set("professional_summary", e.target.value)} />
            </Field>

            <Field label="Preferências alimentares / Rider">
              <textarea className="input" rows={3} value={form.food_preferences_rider || ""} onChange={(e) => set("food_preferences_rider", e.target.value)} />
            </Field>

            <Field label="Observações importantes">
              <textarea className="input" rows={3} value={form.important_observations || ""} onChange={(e) => set("important_observations", e.target.value)} />
            </Field>

            <Field label="Local de moradia">
              <input className="input" value={form.place_of_residence || ""} onChange={(e) => set("place_of_residence", e.target.value)} />
            </Field>
          </>
        ) : null}

        {form && tab === "terceiros" ? (
          <>
            <div className="h2">Necessidade de terceiros</div>

            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" checked={!!form.need_third_parties} onChange={(e) => set("need_third_parties", e.target.checked)} />
              Necessidade de terceiros
            </label>

            <div className="row">
              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!form.third_party_speech_therapist}
                  onChange={(e) => set("third_party_speech_therapist", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Fonoaudióloga
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!form.third_party_barber}
                  onChange={(e) => set("third_party_barber", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Barbeiro
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!form.third_party_hairdresser}
                  onChange={(e) => set("third_party_hairdresser", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Cabeleireiro
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!form.third_party_makeup}
                  onChange={(e) => set("third_party_makeup", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Maquiagem
              </label>
            </div>
          </>
        ) : null}

        {form && tab === "checklist" ? (
          <>
            <div className="h2">Checklist</div>

            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="small">
                Total: <b>{checklistSummary.total}</b> • Concluídas: <b>{checklistSummary.done}</b> • Atrasadas: <b>{checklistSummary.late}</b>
              </div>

              <div className="row">
                <button type="button" className="btn" onClick={() => loadTasks(form.id)} disabled={tasksLoading}>
                  {tasksLoading ? "Atualizando..." : "Atualizar"}
                </button>
                <button type="button" className="btn primary" onClick={() => setNewTaskOpen((v) => !v)} disabled={!full}>
                  {newTaskOpen ? "Fechar" : "Nova tarefa"}
                </button>
              </div>
            </div>

            {}

            {taskError ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{taskError}</div> : null}
            {tasksLoading ? <div className="small" style={{ marginBottom: 10 }}>Carregando tarefas...</div> : null}

            {newTaskOpen ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2">Nova tarefa</div>

                <Field label="Fase">
                  <select className="input" value={newTask.phase} onChange={(e) => setNewTask((p) => ({ ...p, phase: e.target.value }))}>
                    {PHASES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field><Field label="Título">
                  <input
                    className="input"
                    value={newTask.title}
                    onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex.: Criar pasta no Drive"
                  />
                </Field>

                <Field label="Responsável">
                  <select
                    className="input"
                    value={newTask.responsible_id}
                    onChange={(e) => setNewTask((p) => ({ ...p, responsible_id: e.target.value }))}
                  >
                    {profiles.length === 0 ? <option value="">Nenhum usuário ativo cadastrado</option> : null}

                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>

                  {profiles.length === 0 ? (
                    <div className="small" style={{ marginTop: 6 }}>
                      Cadastre usuários na tabela <b>profiles</b> (ou na tela /usuarios quando estiver pronta).
                    </div>
                  ) : null}
                </Field>

                <div className="row">
                  <div className="col">
                    <Field label="Prazo">
                      <input className="input" type="date" value={newTask.due_date} onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))} />
                    </Field>
                  </div>

                  <div className="col">
                    <Field label="Status">
                      <select className="input" value={newTask.status} onChange={(e) => setNewTask((p) => ({ ...p, status: e.target.value }))}>
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>

                <Field label="Evidência (link opcional)" hint="Você também pode fazer upload no botão 'Upload' dentro da tarefa.">
                  <input className="input" value={newTask.evidence_link} onChange={(e) => setNewTask((p) => ({ ...p, evidence_link: e.target.value }))} />
                </Field>

                <div className="row">
                  <button type="button" className="btn" onClick={() => setNewTaskOpen(false)} disabled={taskSaving}>
                    Cancelar
                  </button>
                  <button type="button" className="btn primary" onClick={onCreateTask} disabled={taskSaving || !full}>
                    {taskSaving ? "Criando..." : "Criar tarefa"}
                  </button>
                </div>
              </div>
            ) : null}

            {PHASES.map((ph) => {
              const list = tasksByPhase[ph.key] || [];
              return (
                <div key={ph.key} className="card" style={{ marginBottom: 12 }}>
                  <div className="h2">{ph.label}</div>

                  {tasksLoading ? (
                    <div className="small">Carregando...</div>
                  ) : list.length === 0 ? (
                    <div className="small">Nenhuma tarefa nesta fase.</div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tarefa</th>
                          <th>Responsável</th>
                          <th>Prazo</th>
                          <th>Status</th>
                          <th>Status prazo</th>
                          <th>Data realizada</th>
                          <th>Observações</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((t) => {
                          const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                          const late = isLate(t.due_date, t.status);
                          const canEdit = full || canEditTask({ role, userId: user?.id, taskResponsibleId: t?.responsible_id });

                          return (
                            <tr key={t.id}>

                              <td>
                                {full ? (
                                  <select
                                    className="input"
                                    value={t.responsible_id || ""}
                                    onChange={(e) => onQuickUpdateTask(t, { responsible_id: e.target.value || null })}
                                  >
                                    <option value="">-</option>
                                    {profiles.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} ({roleLabel(p.role)})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span>{prof ? `${prof.name} (${roleLabel(prof.role)})` : "-"}</span>
                                )}
                              </td>

                              <td>
                                {canEdit ? (
                                  <select className="input" value={t.status} onChange={(e) => onQuickUpdateTask(t, { status: e.target.value })}>
                                    {TASK_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span>{t.status}</span>
                                )}
                              </td>

                              <td>
                                {(() => { const s = deadlineStatus(t); return <span className={`badge ${s.kind}`}>{s.label}</span>; })()}
                              </td>

                              <td>
                                {canEdit ? (
                                  <input className="input" value={t.notes || ""} onChange={(e) => onQuickUpdateTask(t, { notes: e.target.value })} placeholder="Observações" />
                                ) : (
                                  <span className="small">{t.notes || "—"}</span>
                                )}
                              </td>

                              <td>
                                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                  {canEdit ? (
                                    <>
                                      <label className="btn" style={{ cursor: "pointer" }}>
                                        Upload
                                        <input
                                          type="file"
                                          style={{ display: "none" }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            e.target.value = "";
                                            if (file) onUploadEvidence(t, file);
                                          }}
                                        />
                                      </label>
                                      <button type="button" className="btn" onClick={() => onQuickUpdateTask(t, { status: "Concluída", done_at: t.done_at || new Date().toISOString().slice(0,10) })}>
                                        Concluir
                                      </button>
                                    </>
                                  ) : null}
                                  {full ? (
                                    <button type="button" className="btn danger" onClick={() => onDeleteTask(t.id)}>
                                      Excluir
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </>
        ) : null}

        </fieldset>

        <div style={{ height: 12 }} />

        {tab !== "checklist" ? (
          <div className="row">
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
              Voltar
            </button>
            <button className="btn primary" type="submit" disabled={saving || loading || !form}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
              Voltar
            </button>
          </div>
        )}
      </form>

      {editModal?.open ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="dialog">
            <div className="dialogHeader">
              <div className="h2" style={{ margin: 0 }}>
                {editModal.type === "cost" ? "Custo" : null}
                {editModal.type === "schedule" ? "Item do Cronograma" : null}
                {editModal.type === "tool" ? "Ferramenta" : null}
                {editModal.type === "material" ? "Material" : null}
                {editModal.type === "video" ? "Vídeo" : null}
                {editModal.type === "pdca" ? "PDCA" : null}
              </div>
              <button type="button" className="btn" onClick={closeEdit}>Fechar</button>
            </div>

            <div className="dialogBody">
              {editModal.type === "cost" ? (
                <div className="grid2">
                  <Field label="Categoria">
                    <input className="input" value={editDraft.category || ""} onChange={(e) => onDraft("category", e.target.value)} />
                  </Field>
                  <Field label="Valor (R$)">
                    <input className="input" inputMode="decimal" value={editDraft.value ?? ""} onChange={(e) => onDraft("value", e.target.value)} />
                  </Field>
                  <Field label="Item">
                    <input className="input" value={editDraft.item || ""} onChange={(e) => onDraft("item", e.target.value)} />
                  </Field>
                  <Field label="Descrição">
                    <textarea className="input" rows={3} value={editDraft.description || ""} onChange={(e) => onDraft("description", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {editModal.type === "schedule" ? (
                <div className="grid2">
                  <Field label="Dia (label)">
                    <input className="input" placeholder="DIA 1" value={editDraft.day_label || ""} onChange={(e) => onDraft("day_label", e.target.value)} />
                  </Field>
                  <Field label="Data do dia">
                    <input className="input" type="date" value={editDraft.day_date || ""} onChange={(e) => onDraft("day_date", e.target.value)} />
                  </Field>
                  <Field label="Início">
                    <input className="input" type="time" value={editDraft.start_time || ""} onChange={(e) => onDraft("start_time", e.target.value)} />
                  </Field>
                  <Field label="Término">
                    <input className="input" type="time" value={editDraft.end_time || ""} onChange={(e) => onDraft("end_time", e.target.value)} />
                  </Field>
                  <Field label="Tempo realizado (min)">
                    <input className="input" inputMode="numeric" value={editDraft.duration_minutes ?? ""} onChange={(e) => onDraft("duration_minutes", e.target.value)} />
                  </Field>
                  <Field label="Ordem">
                    <input className="input" inputMode="numeric" value={editDraft.sort_order ?? 0} onChange={(e) => onDraft("sort_order", e.target.value)} />
                  </Field>
                  <Field label="Tipo de atividade">
                    <input className="input" value={editDraft.activity_type || ""} onChange={(e) => onDraft("activity_type", e.target.value)} />
                  </Field>
                  <Field label="Temas abordados">
                    <textarea className="input" rows={3} value={editDraft.topics || ""} onChange={(e) => onDraft("topics", e.target.value)} />
                  </Field>
                  <Field label="Responsável">
                    <input className="input" value={editDraft.responsible || ""} onChange={(e) => onDraft("responsible", e.target.value)} />
                  </Field>
                  <Field label="Link (PPT/Ferramenta)">
                    <input className="input" value={editDraft.link || ""} onChange={(e) => onDraft("link", e.target.value)} />
                  </Field>
                  <Field label="Orientações para eventos/staff">
                    <textarea className="input" rows={3} value={editDraft.staff_notes || ""} onChange={(e) => onDraft("staff_notes", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {editModal.type === "tool" ? (
                <div className="grid2">
                  <Field label="Nome da ferramenta">
                    <input className="input" value={editDraft.name || ""} onChange={(e) => onDraft("name", e.target.value)} />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={editDraft.link || ""} onChange={(e) => onDraft("link", e.target.value)} />
                  </Field>
                  <Field label="Orientações para impressão">
                    <textarea className="input" rows={3} value={editDraft.print_guidance || ""} onChange={(e) => onDraft("print_guidance", e.target.value)} />
                  </Field>
                  <Field label="Quantidade para impressão">
                    <input className="input" inputMode="numeric" value={editDraft.print_quantity ?? ""} onChange={(e) => onDraft("print_quantity", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {editModal.type === "material" ? (
                <div className="grid2">
                  <Field label="Material">
                    <input className="input" value={editDraft.material || ""} onChange={(e) => onDraft("material", e.target.value)} />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={editDraft.link || ""} onChange={(e) => onDraft("link", e.target.value)} />
                  </Field>
                  <Field label="Quantidade necessária">
                    <input className="input" inputMode="decimal" value={editDraft.quantity ?? ""} onChange={(e) => onDraft("quantity", e.target.value)} />
                  </Field>
                  <Field label="Especificação">
                    <textarea className="input" rows={3} value={editDraft.specification || ""} onChange={(e) => onDraft("specification", e.target.value)} />
                  </Field>
                  <Field label="Referência">
                    <input className="input" value={editDraft.reference || ""} onChange={(e) => onDraft("reference", e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {editModal.type === "video" ? (
                <div className="grid2">
                  <Field label="Vídeo">
                    <input className="input" value={editDraft.title || ""} onChange={(e) => onDraft("title", e.target.value)} />
                  </Field>
                  <Field label="Quando usar">
                    <input className="input" value={editDraft.when_to_use || ""} onChange={(e) => onDraft("when_to_use", e.target.value)} />
                  </Field>
                  <Field label="Link">
                    <input className="input" value={editDraft.link || ""} onChange={(e) => onDraft("link", e.target.value)} />
                  </Field></div>
              ) : null}

              {editModal.type === "pdca" ? (
                <div className="grid2">
                  <Field label="Classificação">
                    <input className="input" value={editDraft.classification || ""} onChange={(e) => onDraft("classification", e.target.value)} />
                  </Field>
                  <Field label="Situação">
                    <input className="input" value={editDraft.situation || ""} onChange={(e) => onDraft("situation", e.target.value)} />
                  </Field>
                  <Field label="Dono(a) do relato">
                    <input className="input" value={editDraft.reporter || ""} onChange={(e) => onDraft("reporter", e.target.value)} />
                  </Field><Field label="Observações">
                    <textarea className="input" rows={4} value={editDraft.notes || ""} onChange={(e) => onDraft("notes", e.target.value)} />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="dialogFooter">
              {editModal.item?.id ? (
                <button type="button" className="btn danger" onClick={deleteEditItem}>Excluir</button>
              ) : null}
              <div style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={closeEdit}>Cancelar</button>
              <button type="button" className="btn primary" onClick={saveEdit}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}

    </Layout>
  );
}
