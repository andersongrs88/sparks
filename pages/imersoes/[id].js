import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import BottomSheet from "../../components/BottomSheet";
import { useAuth } from "../../context/AuthContext";
import { deleteImmersion, getImmersion, updateImmersion } from "../../lib/immersions";
import { supabase } from "../../lib/supabaseClient";
import { listTasksByImmersion, createTask, createTasks, updateTask, deleteTask, syncOverdueTasksForImmersion } from "../../lib/tasks";
import { listActiveProfiles } from "../../lib/profiles";
import { canEditTask, isLimitedImmersionRole, roleLabel } from "../../lib/permissions";
import { createEvidenceSignedUrl, uploadEvidenceFile } from "../../lib/storage";
import { listCosts, createCost, updateCost, deleteCost } from "../../lib/costs";
import { listScheduleItems, createScheduleItem, updateScheduleItem, deleteScheduleItem } from "../../lib/schedule";
import { listTools, createTool, updateTool, deleteTool } from "../../lib/tools";
import { listMaterials, createMaterial, updateMaterial, deleteMaterial } from "../../lib/materials";
import { listVideos, createVideo, updateVideo, deleteVideo } from "../../lib/videos";
import { listPdcaItems, createPdcaItem, updatePdcaItem, deletePdcaItem } from "../../lib/pdca";
import { listSpeakers } from "../../lib/speakers";


const ROOMS = ["Brasil", "São Paulo", "PodCast"];
const IMMERSION_TYPES = [
  "Presencial",
  "Online",
  "Zoom",
  "Entrada",
  "Extras",
  "Giants",
  "Outras"
];
const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];

const TASK_STATUSES = ["Programada", "Em andamento", "Atrasada", "Concluída"];

const COST_CATEGORIES = [
  "Hotel / Hospedagem",
  "Alimentação",
  "Transporte",
  "Infra / AV",
  "Materiais",
  "Brindes",
  "Terceiros",
  "Outros",
];

const PDCA_CATEGORIES = [
  "Planejar (P)",
  "Executar (D)",
  "Checar (C)",
  "Agir (A)",
  "Problema",
  "Risco",
  "Melhoria",
  "Decisão",
  "Outros",
];

function Field({ label, children, hint }) {
  const isReq = typeof hint === "string" && hint.toLowerCase().includes("obrigat");
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="labelRow">
        <label className="label">{label}</label>
        {hint ? (
          <span className={`hint ${isReq ? "hintReq" : ""}`}>{isReq ? "(obrigatório)" : hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Section({ title, description, children, right }) {
  return (
    <div className="section" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="sectionTitle">{title}</div>
          {description ? (
            <div className="small muted" style={{ marginTop: 4 }}>
              {description}
            </div>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="sectionBody">{children}</div>
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
  const { loading: authLoading, user, isFullAccess, canEditPdca, role, profile } = useAuth();
  const canEditAll = isFullAccess;
  const canEditCurrentTab = (t) => (t === "pdca" ? canEditPdca : canEditAll);
  const { id } = router.query;

  const full = isFullAccess;

  const [tab, setTab] = useState("informacoes");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const errorRef = useRef(null);

  useEffect(() => {
    if (error && errorRef.current) {
      try { errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      try { errorRef.current.focus({ preventScroll: true }); } catch {}
    }
  }, [error]);

  const [form, setForm] = useState(null);
  const [originalStatus, setOriginalStatus] = useState(null);
  const isLocked = originalStatus === "Concluída";

  // Governança: bloqueio para concluir imersão com pendências
  const [closeBlock, setCloseBlock] = useState({ open: false, summary: null, sample: [] });

  // Workflow: concluir imersão (botão dedicado)
  const [closeFlow, setCloseFlow] = useState({ open: false, loading: false, error: "", summary: null, sample: [], canClose: false, confirm: false });

  // Clonagem de imersão
  const [cloneFlow, setCloneFlow] = useState({ open: false, loading: false, error: "" });
  const [cloneForm, setCloneForm] = useState({
    immersion_name: "",
    type: "",
    start_date: "",
    end_date: "",
    room_location: "Brasil",
    status: "Planejamento",
    include_templates: true,
    include_schedule: true,
    include_materials: true,
    include_tools: true,
    include_videos: true,
    phases: { "PA-PRE": true, DURANTE: true, POS: true },
  });

  // Checklist
  const [profiles, setProfiles] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

  // UX: filtros/visões para Checklist e Cronograma
  const [taskUi, setTaskUi] = useState({
    q: "",
    phase: "ALL",
    status: "ALL",
    responsible: "ALL",
    onlyLate: false,
    hideDone: false,
    sort: "due", // due | title | status | responsible
    view: "cards", // cards | table
    open: { "PA-PRE": true, DURANTE: true, POS: true },
  });

  const [showTaskFilters, setShowTaskFilters] = useState(false);
  const [showScheduleFilters, setShowScheduleFilters] = useState(false);

  const [scheduleUi, setScheduleUi] = useState({
    q: "",
    day: "ALL",
    type: "ALL",
    view: "cards", // cards | table
    open: {},
  });

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
    notes: ""
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

  const tabs = useMemo(() => {
    const base = [
      { key: "informacoes", label: "Informações" },
      { key: "narrativa", label: "Narrativa" },
      { key: "ferramentas", label: "Ferramentas" },
      { key: "materiais", label: "Materiais" },
      { key: "videos", label: "Vídeos" },
      { key: "pdca", label: "PDCA" },
      { key: "trainer", label: "Trainer/Palestrante" },
    ];
    // Perfis limitados (Eventos/Produção) não visualizam Custos
    if (!isLimitedImmersionRole(role)) {
      base.splice(6, 0, { key: "custos", label: "Custos" });
    }
    return base;
  }, [role]);

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
        if (mounted) {
          setForm(data);
          setOriginalStatus((prev) => (prev === null ? (data?.status || "") : prev));
        }
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

  // Carrega palestrantes (para Trainer e lista de palestrantes na aba Informações)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sp = await listSpeakers();
        if (mounted) setSpeakers(sp || []);
      } catch {
        if (mounted) setSpeakers([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadTasks(immersionId) {
    setTaskError("");
    setTasksLoading(true);
    try {
      // Governança: mantém o status "Atrasada" sincronizado.
      try {
        await syncOverdueTasksForImmersion(immersionId);
      } catch {
        // best-effort
      }
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
    if (!canEditCurrentTab(tab)) return;
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
          value: parseBRLNumber(editDraft.value),
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
          material_type: editDraft.material_type || null,
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

    if (isLocked) {
      setError("Esta imersão está Concluída e não pode mais ser editada.");
      return;
    }

    if (!canEditCurrentTab(tab)) {
      setError(tab === "pdca" ? "Sem permissão para editar o PDCA." : "Sem permissão para editar esta imersão.");
      return;
    }

    setError("");

    if (!form.immersion_name?.trim()) return setError("Preencha o nome da imersão.");
    if (!form.type) return setError("Selecione o tipo da imersão.");
    if (!form.start_date) return setError("Preencha a data de início.");
    if (!form.end_date) return setError("Preencha a data de fim.");
    if (form.need_specific_staff && !(form.staff_justification || "").trim()) {
      return setError("Como staff específico = Sim, preencha a justificativa.");
    }
    if (!form.educational_consultant || !form.instructional_designer) {
      return setError("Defina os 2 responsáveis do time de educação: Consultor e Designer.");
    }

    try {
      // Governança: bloquear "Concluída" com pendências
      const isTryingToClose = form.status === "Concluída" && originalStatus !== "Concluída";
      if (isTryingToClose) {
        let currentTasks = tasks;
        if (!currentTasks || currentTasks.length === 0) {
          try {
            await syncOverdueTasksForImmersion(form.id);
          } catch {
            // best-effort
          }
          try {
            currentTasks = await listTasksByImmersion(form.id);
          } catch {
            currentTasks = tasks || [];
          }
        }

        const open = (currentTasks || []).filter((t) => t.status !== "Concluída");
        const overdue = open.filter((t) => isLate(t.due_date, t.status));
        const orphan = open.filter((t) => !t.responsible_id);

        if (open.length > 0 || overdue.length > 0 || orphan.length > 0) {
          setCloseBlock({
            open: true,
            summary: {
              open: open.length,
              overdue: overdue.length,
              orphan: orphan.length,
            },
            sample: open.slice(0, 8),
          });
          return;
        }
      }

      setSaving(true);
      await updateImmersion(form.id, {
        immersion_name: form.immersion_name.trim(),
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: form.status,

        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,

        production_responsible: form.production_responsible || null,
        events_responsible: form.events_responsible || null,

        // Palestrantes
        trainer_speaker_id: form.trainer_speaker_id || null,
        speaker_ids: Array.isArray(form.speaker_ids) ? form.speaker_ids.filter(Boolean) : [],

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

        // Removido: will_have_speaker (toggle legado). A gestão agora é via speaker_ids.
      });

      alert("Alterações salvas.");
      setOriginalStatus(form.status);
    } catch (e) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ----------------------------
  // Workflow: Concluir imersão (botão dedicado)
  // ----------------------------
  async function openCloseImmersionFlow() {
    if (!form) return;
    if (!full) {
      setError("Sem permissão para concluir esta imersão.");
      return;
    }

    setCloseFlow({ open: true, loading: true, error: "", summary: null, sample: [], canClose: false, confirm: false });
    try {
      try {
        await syncOverdueTasksForImmersion(form.id);
      } catch {
        // best-effort
      }

      const currentTasks = await listTasksByImmersion(form.id);
      const open = (currentTasks || []).filter((t) => t.status !== "Concluída");
      const overdue = open.filter((t) => isLate(t.due_date, t.status));
      const orphan = open.filter((t) => !t.responsible_id);

      const canClose = open.length === 0 && overdue.length === 0 && orphan.length === 0;
      setCloseFlow((p) => ({
        ...p,
        loading: false,
        summary: { open: open.length, overdue: overdue.length, orphan: orphan.length },
        sample: open.slice(0, 10),
        canClose,
      }));
    } catch (e) {
      setCloseFlow((p) => ({ ...p, loading: false, error: e?.message || "Falha ao validar checklist." }));
    }
  }

  async function confirmCloseImmersionFlow() {
    if (!form) return;
    if (!full) return;
    if (!closeFlow?.canClose) return;
    if (!closeFlow?.confirm) {
      setCloseFlow((p) => ({ ...p, error: "Confirme para concluir a imersão." }));
      return;
    }

    try {
      setCloseFlow((p) => ({ ...p, loading: true, error: "" }));
      await updateImmersion(form.id, { status: "Concluída" });
      setForm((p) => ({ ...p, status: "Concluída" }));
      setOriginalStatus("Concluída");
      setCloseFlow({ open: false, loading: false, error: "", summary: null, sample: [], canClose: false, confirm: false });
      alert("Imersão concluída.");
    } catch (e) {
      setCloseFlow((p) => ({ ...p, loading: false, error: e?.message || "Falha ao concluir." }));
    }
  }

  // ----------------------------
  // Workflow: Clonar imersão
  // ----------------------------
  function openCloneImmersionFlow() {
    if (!form) return;
    if (!full) {
      setError("Sem permissão para clonar imersões.");
      return;
    }
    setCloneForm({
      immersion_name: `${form.immersion_name || "Imersão"} (cópia)`,
      type: form.type || "",
      start_date: "",
      end_date: "",
      room_location: form.room_location || "Brasil",
      status: "Planejamento",
      include_templates: true,
      include_schedule: true,
      include_materials: true,
      include_tools: true,
      include_videos: true,
      phases: { "PA-PRE": true, DURANTE: true, POS: true },
    });
    setCloneFlow({ open: true, loading: false, error: "" });
  }

function normalizeTemplatesForClone(items) {
    const phaseOk = new Set(["PA-PRE", "DURANTE", "POS"]);
    return (items || [])
      .map((t) => {
        const title = (t.title || t.task_title || t.name || "").toString().trim();
        const phase = (t.phase || t.task_phase || "PA-PRE").toString().trim();
        const status = (t.status || t.default_status || "Programada").toString().trim();
        return { title, phase: phaseOk.has(phase) ? phase : "PA-PRE", status };
      })
      .filter((t) => !!t.title);
  }

  async function confirmCloneImmersionFlow() {
    if (!form) return;
    if (!full) return;

    setCloneFlow((p) => ({ ...p, loading: true, error: "" }));
    try {
      if (!cloneForm.immersion_name?.trim()) throw new Error("Informe o nome da nova imersão.");
      if (!cloneForm.type) throw new Error("Selecione o tipo.");
      if (!cloneForm.start_date || !cloneForm.end_date) throw new Error("Informe data inicial e final.");
      if (new Date(cloneForm.end_date) < new Date(cloneForm.start_date)) throw new Error("A data final não pode ser anterior à inicial.");

      const r = await fetch("/api/immersions/clone-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: form.id,
          overrides: {
            immersion_name: cloneForm.immersion_name.trim(),
            type: cloneForm.type,
            start_date: cloneForm.start_date,
            end_date: cloneForm.end_date,
            room_location: cloneForm.room_location,
            status: "Planejamento",
            educational_consultant: form.educational_consultant || null,
            instructional_designer: form.instructional_designer || null,
            production_responsible: form.production_responsible || null,
            events_responsible: form.events_responsible || null,
          },
        }),
      });

      if (!r.ok) {
        const msg = await r.text();
        throw new Error(msg || "Falha ao clonar imersão.");
      }
      const out = await r.json();

      setCloneFlow({ open: false, loading: false, error: "" });
      router.push(`/imersoes/${out?.id}`);
    } catch (e) {
      setCloneFlow((p) => ({ ...p, loading: false, error: e?.message || "Falha ao clonar." }));
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

  const filteredTasksByPhase = useMemo(() => {
    const q = (taskUi.q || "").trim().toLowerCase();
    // Na visão Kanban, mostramos todas as fases em colunas (PA-PRÉ/DURANTE/PÓS),
    // portanto ignoramos o filtro de fase para não “esvaziar” o board.
    const wantPhase = taskUi.view === "kanban" ? "ALL" : taskUi.phase;
    const wantStatus = taskUi.status;
    const wantResp = taskUi.responsible;
    const onlyLate = !!taskUi.onlyLate;
    const hideDone = !!taskUi.hideDone;

    const sortKey = taskUi.sort || "due";
    const phaseOrder = { "PA-PRE": 1, DURANTE: 2, POS: 3 };

    const sortFn = (a, b) => {
      if (sortKey === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sortKey === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      if (sortKey === "responsible") {
        const pa = profileById.get(a.responsible_id)?.name || "";
        const pb = profileById.get(b.responsible_id)?.name || "";
        const c = pa.localeCompare(pb);
        if (c !== 0) return c;
      }
      // default: due date (sem prazo por último)
      const da = a.due_date ? new Date(a.due_date + "T00:00:00").getTime() : Number.POSITIVE_INFINITY;
      const db = b.due_date ? new Date(b.due_date + "T00:00:00").getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      // tie-break
      const pha = phaseOrder[a.phase] || 9;
      const phb = phaseOrder[b.phase] || 9;
      if (pha !== phb) return pha - phb;
      return String(a.title || "").localeCompare(String(b.title || ""));
    };

    const base = tasks.filter((t) => {
      if (wantPhase !== "ALL" && t.phase !== wantPhase) return false;
      if (wantStatus !== "ALL" && t.status !== wantStatus) return false;
      if (wantResp !== "ALL" && String(t.responsible_id || "") !== String(wantResp || "")) return false;
      if (hideDone && (t.status === "Concluída" || t.status === "Concluida" || !!t.done_at)) return false;
      if (onlyLate && !isLate(t.due_date, t.status)) return false;
      if (!q) return true;
      const respName = profileById.get(t.responsible_id)?.name || "";
      return (
        String(t.title || "").toLowerCase().includes(q) ||
        String(t.notes || "").toLowerCase().includes(q) ||
        String(respName).toLowerCase().includes(q)
      );
    });

    const map = { "PA-PRE": [], "DURANTE": [], "POS": [] };
    for (const t of base.sort(sortFn)) {
      if (map[t.phase]) map[t.phase].push(t);
    }
    return map;
  }, [tasks, taskUi, profileById]);

  const checklistSummary = useMemo(() => {
    const total = tasks.length;
    // Robustez: bases podem usar "Concluida" (sem acento) e/ou preencher done_at.
    const done = tasks.filter((t) => t.status === "Concluída" || t.status === "Concluida" || !!t.done_at).length;
    const late = tasks.filter((t) => isLate(t.due_date, t.status)).length;
    return { total, done, late };
  }, [tasks]);

  const filteredScheduleByDay = useMemo(() => {
    const items = scheduleItems || [];
    const q = (scheduleUi.q || "").trim().toLowerCase();
    const wantDay = scheduleUi.day || "ALL";
    const wantType = scheduleUi.type || "ALL";

    const norm = items.filter((it) => {
      const dayKey = String(it.day_label || it.day_date || "Sem dia");
      if (wantDay !== "ALL" && dayKey !== wantDay) return false;
      if (wantType !== "ALL" && String(it.activity_type || "") !== wantType) return false;
      if (!q) return true;
      return (
        String(it.topics || "").toLowerCase().includes(q) ||
        String(it.staff_notes || "").toLowerCase().includes(q) ||
        String(it.responsible || "").toLowerCase().includes(q) ||
        String(it.activity_type || "").toLowerCase().includes(q) ||
        String(it.day_label || "").toLowerCase().includes(q)
      );
    });

    const byDay = new Map();
    for (const it of norm) {
      const key = String(it.day_label || it.day_date || "Sem dia");
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(it);
    }

    const dayKeys = Array.from(byDay.keys());
    dayKeys.sort((a, b) => {
      // tenta ordenar por data (day_date), senão por label
      const aDate = (byDay.get(a) || []).find((x) => !!x.day_date)?.day_date || null;
      const bDate = (byDay.get(b) || []).find((x) => !!x.day_date)?.day_date || null;
      const ta = aDate ? new Date(aDate + "T00:00:00").getTime() : Number.POSITIVE_INFINITY;
      const tb = bDate ? new Date(bDate + "T00:00:00").getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });

    const result = dayKeys.map((k) => {
      const list = (byDay.get(k) || []).slice();
      list.sort((a, b) => {
        const sa = a.start_time || "";
        const sb = b.start_time || "";
        if (sa !== sb) return sa.localeCompare(sb);
        const oa = Number(a.sort_order ?? 0);
        const ob = Number(b.sort_order ?? 0);
        if (oa !== ob) return oa - ob;
        return String(a.topics || "").localeCompare(String(b.topics || ""));
      });
      const date = list.find((x) => !!x.day_date)?.day_date || "";
      return { key: k, date, items: list };
    });
    return result;
  }, [scheduleItems, scheduleUi]);

  // Templates (tarefas predefinidas) — loader guiado com preview e confirmação
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [templatesData, setTemplatesData] = useState([]);
  const [templatesPhase, setTemplatesPhase] = useState({ "PA-PRE": true, "DURANTE": true, "POS": true });
  const [templatesSelected, setTemplatesSelected] = useState(() => new Set());
  const [templatesQuery, setTemplatesQuery] = useState("");

  const existingTaskKey = useMemo(() => {
    return new Set((tasks || []).map((t) => `${t.phase}::${String(t.title || "").trim().toLowerCase()}`));
  }, [tasks]);

  const normalizedTemplates = useMemo(() => {
    const norm = (templatesData || [])
      .map((r, idx) => {
        const title = (r.title || r.name || r.task || r.description || "").toString().trim();
        const phaseRaw = (r.phase || r.fase || r.stage || "PA-PRE").toString().trim();
        const phase = ["PA-PRE", "DURANTE", "POS"].includes(phaseRaw) ? phaseRaw : "PA-PRE";
        const statusRaw = (r.status || r.default_status || "Programada").toString().trim();
        const status = TASK_STATUSES.includes(statusRaw) ? statusRaw : "Programada";
        const key = `${phase}::${title.trim().toLowerCase()}`;
        const duplicate = existingTaskKey.has(key);
        const templateId = r.id || r.template_id || null;
        const idKey = templateId ? `id:${templateId}` : `idx:${idx}:${key}`;
        return { idKey, key, title, phase, status, duplicate };
      })
      .filter((t) => !!t.title);

    // Ordenação: fase -> duplicadas por último -> título
    const phaseOrder = { "PA-PRE": 1, DURANTE: 2, POS: 3 };
    norm.sort((a, b) => {
      const pa = phaseOrder[a.phase] || 9;
      const pb = phaseOrder[b.phase] || 9;
      if (pa !== pb) return pa - pb;
      if (a.duplicate !== b.duplicate) return a.duplicate ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
    return norm;
  }, [templatesData, existingTaskKey]);

  const templatesCounts = useMemo(() => {
    const counts = {
      "PA-PRE": { total: 0, new: 0, dup: 0 },
      DURANTE: { total: 0, new: 0, dup: 0 },
      POS: { total: 0, new: 0, dup: 0 },
    };
    for (const t of normalizedTemplates) {
      counts[t.phase].total += 1;
      if (t.duplicate) counts[t.phase].dup += 1;
      else counts[t.phase].new += 1;
    }
    return counts;
  }, [normalizedTemplates]);

  const visibleTemplates = useMemo(() => {
    const q = (templatesQuery || "").trim().toLowerCase();
    return normalizedTemplates.filter((t) => {
      if (!templatesPhase[t.phase]) return false;
      if (!q) return true;
      return t.title.toLowerCase().includes(q);
    });
  }, [normalizedTemplates, templatesPhase, templatesQuery]);

  useEffect(() => {
    if (!templatesOpen) return;
    // Pré-seleciona apenas itens NÃO duplicados nas fases ativas
    const next = new Set();
    for (const t of normalizedTemplates) {
      if (t.duplicate) continue;
      if (!templatesPhase[t.phase]) continue;
      next.add(t.idKey);
    }
    setTemplatesSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesOpen, normalizedTemplates]);

  function openTemplates() {
    if (!full) {
      setTaskError("Sem permissão para carregar tarefas predefinidas.");
      return;
    }
    setTemplatesError("");
    setTemplatesQuery("");
    setTemplatesPhase({ "PA-PRE": true, "DURANTE": true, "POS": true });
    setTemplatesOpen(true);
  }

  async function fetchTemplates() {
    setTemplatesError("");
    setTemplatesLoading(true);
    try {
      const { data: templates, error: te } = await supabase
        .from("task_templates")
        .select("*")
        .order("created_at", { ascending: true, nullsFirst: false })
        .limit(1000);
      if (te) throw te;
      setTemplatesData(templates || []);
    } catch (e) {
      setTemplatesError(e?.message || "Falha ao carregar templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (!templatesOpen) return;
    // Carrega templates quando o modal abrir
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesOpen]);

  function toggleTemplate(idKey, disabled) {
    if (disabled) return;
    setTemplatesSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idKey)) next.delete(idKey);
      else next.add(idKey);
      return next;
    });
  }

  function selectAllVisible() {
    setTemplatesSelected((prev) => {
      const next = new Set(prev);
      for (const t of visibleTemplates) {
        if (t.duplicate) continue;
        next.add(t.idKey);
      }
      return next;
    });
  }

  function clearSelection() {
    setTemplatesSelected(new Set());
  }

  const selectedCount = useMemo(() => templatesSelected.size, [templatesSelected]);

  async function onLoadPredefinedTasks() {
    if (!id || typeof id !== "string") return;
    if (!full) {
      setTaskError("Sem permissão para carregar tarefas predefinidas.");
      return;
    }

    // Mantido por compatibilidade; agora o fluxo abre o modal guiado.
    openTemplates();
  }

  async function onConfirmLoadTemplates() {
    if (!id || typeof id !== "string") return;
    if (!full) {
      setTemplatesError("Sem permissão para carregar tarefas predefinidas.");
      return;
    }
    setTemplatesError("");
    setTaskError("");

    try {
      setTasksLoading(true);
      const selected = new Set(templatesSelected);
      const chosen = normalizedTemplates.filter((t) => selected.has(t.idKey) && !t.duplicate);

      if (chosen.length === 0) {
        setTemplatesError("Selecione pelo menos 1 tarefa nova para carregar.");
        return;
      }

      const rows = chosen.map((t) => ({
        immersion_id: id,
        title: t.title,
        phase: t.phase,
        status: t.status,
        created_by: user?.id || null,
        // responsible_id e due_date serão preenchidos automaticamente no lib/tasks
      }));

      await createTasks(rows);

      setTemplatesOpen(false);
      await loadTasks(id);
    } catch (e) {
      setTemplatesError(e?.message || "Falha ao carregar tarefas predefinidas.");
    } finally {
      setTasksLoading(false);
    }
  }

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
        created_by: user?.id || null
      });

      setNewTaskOpen(false);
      setNewTask((p) => ({ ...p, title: "", due_date: "", done_at: "", notes: "", status: "Programada" }));
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

      // Auditoria mínima ao concluir tarefa
      if (Object.prototype.hasOwnProperty.call(normalized, "status") && normalized.status === "Concluída") {
        const now = new Date();
        normalized.completed_by = user?.id || null;
        normalized.completed_at = now.toISOString();
        // compat: algumas bases usam done_at como date-only
        normalized.done_at = now.toISOString().slice(0, 10);
      }
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
                {form.start_date} → {form.end_date} • Tipo: {form.type || "-"} • Sala: {form.room_location || "-"} • Status: {form.status}
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

              {form?.status !== "Concluída" ? (
                <button type="button" className="btn" onClick={openCloneImmersionFlow} disabled={!full} title="Criar uma nova imersão copiando responsáveis e (opcionalmente) tarefas predefinidas">
                  Clonar
                </button>
              ) : (
                <button type="button" className="btn" onClick={openCloneImmersionFlow} disabled={!full}>
                  Clonar
                </button>
              )}


              {form?.status !== "Concluída" ? (
                <button type="button" className="btn primary" onClick={openCloseImmersionFlow} disabled={!full}>
                  Concluir imersão
                </button>
              ) : (
                <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", border: "1px solid var(--border)" }}>
                  Concluída
                </span>
              )}

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

        {error ? (
              <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
                {error}
              </div>
            ) : null}

        {!form ? <div className="small">Nada para editar.</div> : null}

        <fieldset disabled={!full || isLocked || !canEditCurrentTab(tab) || saving} style={{ border: 0, padding: 0, margin: 0 }}>
        {form && tab === "essencial" ? (
          <>
            <Section
              title="Essencial"
              description="Defina o mínimo para a imersão existir: nome, tipo e datas. O restante você completa nas outras abas."
            >
              <Field label="Nome da imersão" hint="Obrigatório">
                <input
                  className="input"
                  value={form.immersion_name || ""}
                  onChange={(e) => set("immersion_name", e.target.value)}
                  placeholder="Ex.: Acelerador Empresarial #79 | Presencial"
                />
              </Field>

              <div className="grid2">
                <Field label="Tipo" hint="Obrigatório">
                  <select className="input" value={form.type || ""} onChange={(e) => set("type", e.target.value)}>
                    <option value="">Selecione</option>
                    {IMMERSION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Data de início" hint="Obrigatório">
                  <input className="input" type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
                </Field>

                <Field label="Data de fim" hint="Obrigatório">
                  <input className="input" type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
                </Field>
              </div>

              <div className="small muted" style={{ marginTop: 6 }}>
                Dica: conclua esta aba primeiro. Depois, preencha operação, time e módulos (cronograma, checklist, materiais etc.).
              </div>
            </Section>
          </>
        ) : null}

        
        {form && tab === "informacoes" ? (
          <>
            <Section
              title="Informações"
              description="Estrutura recomendada: preencha a base + defina os 2 responsáveis do time de educação (Consultor e Designer)."
              right={null}
            >
              <div className="grid2">
                <Field label="Nome da imersão">
                  <input
                    className="input"
                    value={form.immersion_name || ""}
                    onChange={(e) => set("immersion_name", e.target.value)}
                    placeholder="Ex.: Imersão Gestão MKT Digital"
                  />
                </Field>

                <Field label="Formato" hint="Obrigatório">
                  <select className="input" value={form.type || ""} onChange={(e) => set("type", e.target.value)}>
                    <option value="">Selecione</option>
                    {IMMERSION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Removido: Aplicar Template por tipo (não utilizado no produto atual). */}

              <Section title="Informações básicas">
                <div className="grid2">
                  <Field label="Sala" hint="Obrigatório">
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
                      <option value="Cancelada">Cancelada</option>
                      <option value="Concluída">Concluída</option>
                    </select>
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Para concluir, prefira o botão <b>Concluir imersão</b> no topo (governança de pendências).
                    </div>
                  </Field>
                </div>

                <div className="grid2">
                  <Field label="Data inicial" hint="Obrigatório">
                    <input className="input" type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
                  </Field>

                  <Field label="Data final" hint="Obrigatório">
                    <input className="input" type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
                  </Field>
                </div>
              </Section>

              <Section title="Time de educação" description="Defina os 2 responsáveis do time de educação (Consultor e Designer).">
                <div className="grid2">
                  <Field label="Consultor (Educação)" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.educational_consultant || ""}
                      onChange={(e) => set("educational_consultant", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Designer instrucional" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.instructional_designer || ""}
                      onChange={(e) => set("instructional_designer", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid2">
                  <Field label="Produção (responsável)" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.production_responsible || ""}
                      onChange={(e) => set("production_responsible", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Eventos (opcional)">
                    <select
                      className="input"
                      value={form.events_responsible || ""}
                      onChange={(e) => set("events_responsible", e.target.value)}
                    >
                      <option value="">—</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Palestrantes" description="Vincule o Trainer e, se houver, múltiplos palestrantes nesta imersão.">
                <div className="grid2">
                  <Field label="Nome do Trainer">
                    <select className="input" value={form.trainer_speaker_id || ""} onChange={(e) => set("trainer_speaker_id", e.target.value)}>
                      <option value="">—</option>
                      {speakers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name || s.email}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Vai ter palestrante?">
                    <div className="stack" style={{ gap: 10 }}>
                      {((form.speaker_ids && Array.isArray(form.speaker_ids) ? form.speaker_ids : [""]) || [""]).map((sid, idx) => (
                        <div key={idx} className="row" style={{ gap: 10 }}>
                          <select
                            className="input"
                            value={sid || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setForm((p) => {
                                const next = Array.isArray(p.speaker_ids) ? [...p.speaker_ids] : [""];
                                next[idx] = v;
                                return { ...p, speaker_ids: next };
                              });
                            }}
                          >
                            <option value="">Selecione</option>
                            {speakers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.full_name || s.email}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setForm((p) => {
                                const next = Array.isArray(p.speaker_ids) ? [...p.speaker_ids] : [];
                                next.splice(idx, 1);
                                return { ...p, speaker_ids: next.length ? next : [""] };
                              });
                            }}
                            disabled={Array.isArray(form.speaker_ids) ? form.speaker_ids.length === 1 : true}
                          >
                            Remover
                          </button>
                        </div>
                      ))}

                      <div className="row" style={{ gap: 10 }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setForm((p) => ({
                              ...p,
                              speaker_ids: [...(Array.isArray(p.speaker_ids) ? p.speaker_ids : [""]), ""],
                            }));
                          }}
                        >
                          + Adicionar palestrante
                        </button>
                        <div className="small muted">Opcional. Deixe vazio se não houver.</div>
                      </div>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="Mentores presentes">
                <Field label="Mentores presentes">
                  <input className="input" value={form.mentors_present || ""} onChange={(e) => set("mentors_present", e.target.value)} placeholder="Ex.: Nome 1, Nome 2" />
                </Field>
              </Section>

              <Section title="Links e documentos">
                <div className="grid2">
                  <Field label="Ordem de Serviço (link)">
                    <input className="input" value={form.service_order_link || ""} onChange={(e) => set("service_order_link", e.target.value)} placeholder="URL" />
                  </Field>
                  <Field label="Ficha Técnica (link)">
                    <input className="input" value={form.technical_sheet_link || ""} onChange={(e) => set("technical_sheet_link", e.target.value)} placeholder="URL" />
                  </Field>
                </div>
              </Section>

              <Section title="Recursos e staff">
                <Field label="Precisa de staff específico?">
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

                {/* Removido: "Vai ter palestrante?" (toggle). A gestão agora é por lista vinculada em "Palestrantes". */}
              </Section>

              <Section title="Necessidade de terceiros">
                <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <input type="checkbox" checked={!!form.need_third_parties} onChange={(e) => set("need_third_parties", e.target.checked)} />
                  Necessidade de terceiros
                </label>

                <div className="row" style={{ flexWrap: "wrap", gap: 18 }}>
                  <label className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!form.third_party_speech_therapist}
                      onChange={(e) => set("third_party_speech_therapist", e.target.checked)}
                      disabled={!form.need_third_parties}
                    />
                    Fonoaudióloga
                  </label>

                  <label className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!form.third_party_barber}
                      onChange={(e) => set("third_party_barber", e.target.checked)}
                      disabled={!form.need_third_parties}
                    />
                    Barbeiro
                  </label>

                  <label className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!form.third_party_hairdresser}
                      onChange={(e) => set("third_party_hairdresser", e.target.checked)}
                      disabled={!form.need_third_parties}
                    />
                    Cabeleireiro
                  </label>

                  <label className="small" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!form.third_party_makeup}
                      onChange={(e) => set("third_party_makeup", e.target.checked)}
                      disabled={!form.need_third_parties}
                    />
                    Maquiagem
                  </label>
                </div>
              </Section>
            </Section>
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

            {/* Toolbar (filtros + visões) */}
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <div className="toolbarLeft">
                <input
                  className="input"
                  placeholder="Buscar por tema, tipo, responsável ou orientação..."
                  value={scheduleUi.q}
                  onChange={(e) => setScheduleUi((p) => ({ ...p, q: e.target.value }))}
                  style={{ minWidth: 260 }}
                />
                <div className="onlyMobile">
                  <button className="btn sm" onClick={() => setShowScheduleFilters(true)}>Filtros</button>
                </div>
<div className="onlyDesktop" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <select className="input" value={scheduleUi.day} onChange={(e) => setScheduleUi((p) => ({ ...p, day: e.target.value }))}>
                    <option value="ALL">Todos os dias</option>
                    {Array.from(new Set((scheduleItems || []).map((it) => String(it.day_label || it.day_date || "Sem dia"))))
                      .filter((v) => !!v)
                      .map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                  </select>
                  <select className="input" value={scheduleUi.type} onChange={(e) => setScheduleUi((p) => ({ ...p, type: e.target.value }))}>
                    <option value="ALL">Todos os tipos</option>
                    {Array.from(new Set((scheduleItems || []).map((it) => String(it.activity_type || ""))))
                      .filter((v) => !!v)
                      .sort((a, b) => a.localeCompare(b))
                      .map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="toolbarRight">
                <button
                  type="button"
                  className={scheduleUi.view === "cards" ? "btn primary" : "btn"}
                  onClick={() => setScheduleUi((p) => ({ ...p, view: "cards" }))}
                  title="Visualização compacta (recomendada)"
                >
                  Compacto
                </button>
                <button
                  type="button"
                  className={scheduleUi.view === "table" ? "btn primary" : "btn"}
                  onClick={() => setScheduleUi((p) => ({ ...p, view: "table" }))}
                  title="Visualização em tabela (mais detalhada)"
                >
                  Tabela
                </button>
              </div>
            </div>



            <BottomSheet
              open={showScheduleFilters}
              title="Filtros do cronograma"
              onClose={() => setShowScheduleFilters(false)}
              footer={
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button className="btn ghost" onClick={() => setScheduleUi((p) => ({ ...p, day: "ALL", type: "ALL" }))}>Limpar</button>
                  <button className="btn" onClick={() => setShowScheduleFilters(false)}>Aplicar</button>
                </div>
              }
            >
              <div className="grid2" style={{ gap: 12 }}>
                <div>
                  <div className="label">Dia</div>
                  <select className="input" value={scheduleUi.day} onChange={(e) => setScheduleUi((p) => ({ ...p, day: e.target.value }))}>
                    <option value="ALL">Todos os dias</option>
                    {Array.from(new Set((scheduleItems || []).map((it) => String(it.day_label || it.day_date || "Sem dia"))))
                      .filter((v) => !!v)
                      .map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <div className="label">Tipo</div>
                  <select className="input" value={scheduleUi.type} onChange={(e) => setScheduleUi((p) => ({ ...p, type: e.target.value }))}>
                    <option value="ALL">Todos</option>
                    {Array.from(new Set((scheduleItems || []).map((it) => String(it.type || "Sem tipo"))))
                      .filter((v) => !!v)
                      .map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                  </select>
                </div>
              </div>
            </BottomSheet>


            {scheduleUi.view === "table" ? (
              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Data</th>
                      <th>Horário</th>
                      <th>Tipo</th>
                      <th>Temas</th>
                      <th>Responsável</th>
                      <th>Link</th>
                      <th>Orientações</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScheduleByDay.flatMap((g) => g.items).map((it) => (
                      <tr key={it.id}>
                        <td>{it.day_label || "—"}</td>
                        <td>{it.day_date || "—"}</td>
                        <td>
                          {it.start_time || "—"}
                          {it.end_time ? `–${it.end_time}` : ""}
                          {typeof it.duration_minutes === "number" ? ` • ${it.duration_minutes}m` : ""}
                        </td>
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
                    {filteredScheduleByDay.length === 0 ? (
                      <tr><td colSpan={9} className="small" style={{ color: "var(--muted)" }}>Sem itens para os filtros atuais.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {filteredScheduleByDay.map((g) => {
                  const isOpen = scheduleUi.open?.[g.key] ?? true;
                  return (
                    <div key={g.key} className="card">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div>
                          <div className="h2" style={{ margin: 0 }}>{g.key}</div>
                          {g.date ? <div className="small muted" style={{ marginTop: 4 }}>{g.date}</div> : null}
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>{g.items.length} itens</span>
                          <button type="button" className="btn" onClick={() => setScheduleUi((p) => ({ ...p, open: { ...(p.open || {}), [g.key]: !(p.open?.[g.key] ?? true) } }))}>
                            {isOpen ? "Recolher" : "Expandir"}
                          </button>
                        </div>
                      </div>

                      {!isOpen ? null : (
                        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                          {g.items.map((it) => (
                            <div key={it.id} className="compactItem">
                              <div className="compactMain">
                                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{it.topics || "(Sem tema)"}</div>
                                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                                      <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                                        {it.start_time || "—"}{it.end_time ? `–${it.end_time}` : ""}{typeof it.duration_minutes === "number" ? ` • ${it.duration_minutes}m` : ""}
                                      </span>
                                      {it.activity_type ? <span className="badge" style={{ background: "var(--info-soft)", border: "1px solid var(--border)" }}>{it.activity_type}</span> : null}
                                      {it.responsible ? <span className="small muted">Resp.: {it.responsible}</span> : null}
                                      {it.link ? <a className="small" href={it.link} target="_blank" rel="noreferrer">Abrir link</a> : null}
                                    </div>
                                  </div>
                                </div>

                                {it.staff_notes ? (
                                  <details style={{ marginTop: 10 }}>
                                    <summary className="small" style={{ cursor: "pointer" }}>Orientações</summary>
                                    <div className="small" style={{ marginTop: 6 }}>{it.staff_notes}</div>
                                  </details>
                                ) : null}
                              </div>

                              <div className="compactActions">
                                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                  <button type="button" className="btn" onClick={() => openEdit("schedule", it)} disabled={!full}>Editar</button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredScheduleByDay.length === 0 ? (
                  <div className="small" style={{ color: "var(--muted)" }}>Sem itens para os filtros atuais.</div>
                ) : null}
              </div>
            )}
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

        {form && tab === "time" ? (
          <>
            <Section
              title="Time de Educação"
              description="Defina os 2 responsáveis desta imersão (Consultor e Designer). Isso alimenta notificações e relatórios."
            >
              <div className="grid2">
                <Field label="Consultor (Educação)" hint="Obrigatório">
                  <select
                    className="input"
                    value={form.educational_consultant || ""}
                    onChange={(e) => set("educational_consultant", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Designer instrucional" hint="Obrigatório">
                  <select
                    className="input"
                    value={form.instructional_designer || ""}
                    onChange={(e) => set("instructional_designer", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {(profiles || []).length === 0 ? (
                <div className="small" style={{ color: "var(--warning)", marginTop: 8 }}>
                  Não foi possível carregar a lista de usuários. Verifique a tabela <b>profiles</b>.
                </div>
              ) : null}
            </Section>
          </>
        ) : null}

{form && tab === "operacao" ? (
          <>
            <Section title="Operação" description="Defina local, status e links operacionais.">
              <div className="grid2">
                <Field label="Sala / Local" hint="Obrigatório">
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
                    <option value="Cancelada">Cancelada</option>
                  </select>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    Para concluir, use o botão <b>Concluir imersão</b> no topo. Isso garante que não existam tarefas pendentes.
                  </div>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Ordem de serviço (link)">
                  <input className="input" value={form.service_order_link || ""} onChange={(e) => set("service_order_link", e.target.value)} placeholder="https://..." />
                </Field>

                <Field label="Ficha técnica (link)">
                  <input className="input" value={form.technical_sheet_link || ""} onChange={(e) => set("technical_sheet_link", e.target.value)} placeholder="https://..." />
                </Field>
              </div>
            </Section>

            <Section title="Mentores e staff" description="Use esta seção apenas quando necessário para execução.">
              <Field label="Mentores que estarão presentes">
                <textarea className="input" rows={4} value={form.mentors_present || ""} onChange={(e) => set("mentors_present", e.target.value)} />
              </Field>

              <Field label="Precisa de staff específico?">
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

              <Field label="Palestrantes">
                <div className="small muted">
                  A gestão de Trainer e palestrantes foi centralizada na seção <b>Palestrantes</b> (na aba Informações), com lista e suporte a múltiplos palestrantes.
                </div>
              </Field>
            </Section>
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
                <button
                  type="button"
                  className="btn"
                  onClick={onLoadPredefinedTasks}
                  disabled={tasksLoading || !full}
                  title={!full ? "Apenas administradores podem carregar tarefas predefinidas." : ""}
                >
                  Carregar predefinidas
                </button>
                <button type="button" className="btn primary" onClick={() => setNewTaskOpen((v) => !v)} disabled={!full}>
                  {newTaskOpen ? "Fechar" : "Nova tarefa"}
                </button>
              </div>
            </div>

            {/* Barra de filtros (reduz ruído visual e melhora uso no mobile) */}
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <div className="toolbarLeft">
                <input
                  className="input"
                  placeholder="Buscar por tarefa, responsável ou observação..."
                  value={taskUi.q}
                  onChange={(e) => setTaskUi((p) => ({ ...p, q: e.target.value }))}
                  style={{ minWidth: 260 }}
                />
                <select className="input" value={taskUi.phase} onChange={(e) => setTaskUi((p) => ({ ...p, phase: e.target.value }))}>
                  <option value="ALL">Todas as fases</option>
                  {PHASES.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
                <select className="input" value={taskUi.status} onChange={(e) => setTaskUi((p) => ({ ...p, status: e.target.value }))}>
                  <option value="ALL">Todos os status</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select className="input" value={taskUi.responsible} onChange={(e) => setTaskUi((p) => ({ ...p, responsible: e.target.value }))}>
                  <option value="ALL">Todos os responsáveis</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="toolbarRight">
                <button
                  type="button"
                  className={taskUi.onlyLate ? "btn primary" : "btn"}
                  onClick={() => setTaskUi((p) => ({ ...p, onlyLate: !p.onlyLate }))}
                  title="Mostrar apenas tarefas atrasadas"
                >
                  Atrasadas
                </button>
                <button
                  type="button"
                  className={taskUi.hideDone ? "btn primary" : "btn"}
                  onClick={() => setTaskUi((p) => ({ ...p, hideDone: !p.hideDone }))}
                  title="Ocultar tarefas concluídas"
                >
                  Ocultar concluídas
                </button>
                <select className="input" value={taskUi.sort} onChange={(e) => setTaskUi((p) => ({ ...p, sort: e.target.value }))}>
                  <option value="due">Ordenar: prazo</option>
                  <option value="title">Ordenar: título</option>
                  <option value="status">Ordenar: status</option>
                  <option value="responsible">Ordenar: responsável</option>
                </select>
                <button
                  type="button"
                  className={taskUi.view === "cards" ? "btn primary" : "btn"}
                  onClick={() => setTaskUi((p) => ({ ...p, view: "cards" }))}
                  title="Visualização compacta (recomendada)"
                >
                  Compacto
                </button>
                <button
                  type="button"
                  className={taskUi.view === "table" ? "btn primary" : "btn"}
                  onClick={() => setTaskUi((p) => ({ ...p, view: "table" }))}
                  title="Visualização em tabela (mais detalhada)"
                >
                  Tabela
                </button>
                <button
                  type="button"
                  className={taskUi.view === "kanban" ? "btn primary" : "btn"}
                  onClick={() => setTaskUi((p) => ({ ...p, view: "kanban" }))}
                  title="Mini Kanban por fase (PA-PRÉ/DURANTE/PÓS)"
                >
                  Kanban
                </button>
              </div>
            </div>

            {templatesOpen ? (
              <div className="overlay" role="dialog" aria-modal="true">
                <div className="dialog" style={{ maxWidth: 980 }}>
                  <div className="dialogHeader">
                    <div>
                      <div className="h2" style={{ margin: 0 }}>Carregar tarefas predefinidas</div>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        Selecione fases, revise as tarefas e confirme. Itens marcados como “Já existe” não serão inseridos.
                      </div>
                    </div>
                    <div className="row" style={{ gap: 10 }}>
                      <button type="button" className="btn" onClick={() => setTemplatesOpen(false)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={onConfirmLoadTemplates}
                        disabled={tasksLoading || templatesLoading || selectedCount === 0}
                        title={selectedCount === 0 ? "Selecione tarefas para carregar." : ""}
                      >
                        Carregar selecionadas ({selectedCount})
                      </button>
                    </div>
                  </div>

                  <div className="dialogBody">
                    {templatesError ? (
                      <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{templatesError}</div>
                    ) : null}

                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={`btn ${templatesPhase["PA-PRE"] ? "primary" : ""}`}
                            onClick={() => setTemplatesPhase((p) => ({ ...p, "PA-PRE": !p["PA-PRE"] }))}
                            title={`PA-PRÉ: ${templatesCounts["PA-PRE"].new} novas • ${templatesCounts["PA-PRE"].dup} já existem`}
                          >
                            PA-PRÉ ({templatesCounts["PA-PRE"].new}/{templatesCounts["PA-PRE"].total})
                          </button>
                          <button
                            type="button"
                            className={`btn ${templatesPhase.DURANTE ? "primary" : ""}`}
                            onClick={() => setTemplatesPhase((p) => ({ ...p, DURANTE: !p.DURANTE }))}
                            title={`DURANTE: ${templatesCounts.DURANTE.new} novas • ${templatesCounts.DURANTE.dup} já existem`}
                          >
                            DURANTE ({templatesCounts.DURANTE.new}/{templatesCounts.DURANTE.total})
                          </button>
                          <button
                            type="button"
                            className={`btn ${templatesPhase.POS ? "primary" : ""}`}
                            onClick={() => setTemplatesPhase((p) => ({ ...p, POS: !p.POS }))}
                            title={`PÓS: ${templatesCounts.POS.new} novas • ${templatesCounts.POS.dup} já existem`}
                          >
                            PÓS ({templatesCounts.POS.new}/{templatesCounts.POS.total})
                          </button>
                        </div>

                        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                          <input
                            className="input"
                            placeholder="Buscar tarefa..."
                            value={templatesQuery}
                            onChange={(e) => setTemplatesQuery(e.target.value)}
                            style={{ width: 280, maxWidth: "100%" }}
                          />
                          <button type="button" className="btn" onClick={selectAllVisible} disabled={templatesLoading}>
                            Selecionar visíveis
                          </button>
                          <button type="button" className="btn" onClick={clearSelection} disabled={templatesLoading}>
                            Limpar
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ maxHeight: 420, overflow: "auto" }}>
                        {templatesLoading ? (
                          <div className="small" style={{ padding: 12 }}>Carregando templates...</div>
                        ) : visibleTemplates.length === 0 ? (
                          <div className="small" style={{ padding: 12 }}>Nenhuma tarefa encontrada para os filtros atuais.</div>
                        ) : (
                          <table className="table">
                            <thead>
                              <tr>
                                <th style={{ width: 44 }} />
                                <th>Tarefa</th>
                                <th style={{ width: 110 }}>Fase</th>
                                <th style={{ width: 140 }}>Status</th>
                                <th style={{ width: 120 }}>Situação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleTemplates.map((t) => {
                                const checked = templatesSelected.has(t.idKey);
                                const disabled = t.duplicate;
                                return (
                                  <tr key={t.idKey} style={{ opacity: disabled ? 0.6 : 1 }}>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={() => toggleTemplate(t.idKey, disabled)}
                                      />
                                    </td>
                                    <td>{t.title}</td>
                                    <td>
                                      <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                                        {t.phase === "PA-PRE" ? "PA-PRÉ" : t.phase === "POS" ? "PÓS" : t.phase}
                                      </span>
                                    </td>
                                    <td>
                                      <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>{t.status}</span>
                                    </td>
                                    <td>
                                      {t.duplicate ? (
                                        <span className="badge" style={{ background: "var(--warning-soft)", border: "1px solid var(--border)", color: "var(--text)" }}>
                                          Já existe
                                        </span>
                                      ) : (
                                        <span className="badge" style={{ background: "var(--success-soft)", border: "1px solid var(--border)", color: "var(--text)" }}>
                                          Nova
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

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

            {taskUi.view === "kanban" ? (
              <div className="kanbanBoard" style={{ marginTop: 10 }}>
                {PHASES.map((ph) => {
                  const list = filteredTasksByPhase[ph.key] || [];
                  return (
                    <div key={ph.key} className="kanbanCol">
                      <div className="kanbanColHeader">
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <div className="h2" style={{ margin: 0 }}>{ph.label}</div>
                          <span className="badge">{list.length}</span>
                        </div>
                        <div className="small muted" style={{ marginTop: 4 }}>Arraste visual (simples) por fase.</div>
                      </div>

                      <div className="kanbanColBody">
                        {tasksLoading ? (
                          <div className="small muted">Carregando...</div>
                        ) : list.length === 0 ? (
                          <div className="small muted">Nenhuma tarefa para os filtros atuais.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {list.map((t) => {
                              const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                              const canEdit = full || canEditTask({ role, userId: user?.id, taskResponsibleId: t?.responsible_id });
                              const s = deadlineStatus(t);
                              return (
                                <div key={t.id} className="kanbanCard">
                                  <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{t.title}</div>
                                      <div className="small muted" style={{ marginTop: 6 }}>
                                        {prof ? prof.name : "Sem responsável"}
                                        {t.due_date ? ` • Prazo: ${t.due_date}` : " • Sem prazo"}
                                      </div>
                                    </div>
                                    <span className={`badge ${s.kind}`}>{s.label}</span>
                                  </div>

                                  <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                    {canEdit ? (
                                      <button type="button" className="btn sm" onClick={() => onQuickUpdateTask(t, { status: "Concluída", done_at: t.done_at || new Date().toISOString().slice(0, 10) })}>
                                        Concluir
                                      </button>
                                    ) : null}
                                    <button type="button" className="btn sm" onClick={() => setEditModal({ open: true, kind: "task", item: t })}>
                                      Editar
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              PHASES.map((ph) => {
              const list = filteredTasksByPhase[ph.key] || [];
              const isOpen = taskUi.open?.[ph.key] ?? true;
              const done = (tasksByPhase[ph.key] || []).filter((t) => t.status === "Concluída" || t.status === "Concluida" || !!t.done_at).length;
              const late = (tasksByPhase[ph.key] || []).filter((t) => isLate(t.due_date, t.status)).length;
              const total = (tasksByPhase[ph.key] || []).length;

              return (
                <div key={ph.key} className="card" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div className="h2" style={{ margin: 0 }}>{ph.label}</div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        Total: <b>{total}</b> • Concluídas: <b>{done}</b> • Atrasadas: <b>{late}</b>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn"
                      onClick={() => setTaskUi((p) => ({ ...p, open: { ...(p.open || {}), [ph.key]: !(p.open?.[ph.key] ?? true) } }))}
                    >
                      {isOpen ? "Recolher" : "Expandir"}
                    </button>
                  </div>

                  {!isOpen ? null : tasksLoading ? (
                    <div className="small" style={{ marginTop: 10 }}>Carregando...</div>
                  ) : list.length === 0 ? (
                    <div className="small" style={{ marginTop: 10 }}>Nenhuma tarefa para os filtros atuais.</div>
                  ) : taskUi.view === "table" ? (
                    <div className="tableWrap" style={{ marginTop: 10 }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tarefa</th>
                            <th>Responsável</th>
                            <th>Prazo</th>
                            <th>Status</th>
                            <th>Situação</th>
                            <th>Obs.</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((t) => {
                            const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                            const canEdit = full || canEditTask({ role, userId: user?.id, taskResponsibleId: t?.responsible_id });
                            const s = deadlineStatus(t);
                            return (
                              <tr key={t.id}>
                                <td>
                                  <div style={{ minWidth: 260 }}>
                                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                                    {t.status === "Concluída" && t.done_at ? (
                                      <div className="small muted">Realizada em {t.done_at}</div>
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  {full ? (
                                    <select className="input" value={t.responsible_id || ""} onChange={(e) => onQuickUpdateTask(t, { responsible_id: e.target.value || null })}>
                                      <option value="">-</option>
                                      {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} ({roleLabel(p.role)})</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span>{prof ? `${prof.name} (${roleLabel(prof.role)})` : "-"}</span>
                                  )}
                                </td>
                                <td>
                                  {canEdit ? (
                                    <input className="input" type="date" value={t.due_date || ""} onChange={(e) => onQuickUpdateTask(t, { due_date: e.target.value || null })} />
                                  ) : (
                                    <span>{t.due_date || "-"}</span>
                                  )}
                                </td>
                                <td>
                                  {canEdit ? (
                                    <select className="input" value={t.status} onChange={(e) => onQuickUpdateTask(t, { status: e.target.value })}>
                                      {TASK_STATUSES.map((st) => (
                                        <option key={st} value={st}>{st}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span>{t.status}</span>
                                  )}
                                </td>
                                <td><span className={`badge ${s.kind}`}>{s.label}</span></td>
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
                                        <button type="button" className="btn" onClick={() => onQuickUpdateTask(t, { status: "Concluída", done_at: t.done_at || new Date().toISOString().slice(0, 10) })}>
                                          Concluir
                                        </button>
                                      </>
                                    ) : null}
                                    {full ? (
                                      <button type="button" className="btn danger" onClick={() => onDeleteTask(t.id)}>Excluir</button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {list.map((t) => {
                        const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                        const canEdit = full || canEditTask({ role, userId: user?.id, taskResponsibleId: t?.responsible_id });
                        const s = deadlineStatus(t);
                        const isDone = t.status === "Concluída" || t.status === "Concluida" || !!t.done_at;
                        return (
                          <div key={t.id} className="compactItem">
                            <div className="compactMain">
                              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                                    {canEdit ? (
                                      <label className="chk" title={isDone ? "Marcar como não concluída" : "Marcar como concluída"}>
                                        <input
                                          type="checkbox"
                                          checked={isDone}
                                          onChange={(e) =>
                                            onQuickUpdateTask(t, e.target.checked
                                              ? { status: "Concluída", done_at: t.done_at || new Date().toISOString().slice(0, 10) }
                                              : { status: "Programada", done_at: null }
                                            )
                                          }
                                        />
                                      </label>
                                    ) : null}
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{t.title}</div>
                                      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                                        <span className={`badge ${s.kind}`}>{s.label}</span>
                                        {isDone && t.done_at ? <span className="small muted">Realizada: {t.done_at}</span> : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  {canEdit ? (
                                    <select className="input" value={t.status} onChange={(e) => onQuickUpdateTask(t, { status: e.target.value })}>
                                      {TASK_STATUSES.map((st) => (
                                        <option key={st} value={st}>{st}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>{t.status}</span>
                                  )}
                                </div>
                              </div>

                              <div className="grid2" style={{ marginTop: 10 }}>
                                <div>
                                  <div className="small muted" style={{ marginBottom: 6 }}>Responsável</div>
                                  {full ? (
                                    <select className="input" value={t.responsible_id || ""} onChange={(e) => onQuickUpdateTask(t, { responsible_id: e.target.value || null })}>
                                      <option value="">-</option>
                                      {profiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} ({roleLabel(p.role)})</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="small">{prof ? `${prof.name} (${roleLabel(prof.role)})` : "-"}</div>
                                  )}
                                </div>
                                <div>
                                  <div className="small muted" style={{ marginBottom: 6 }}>Prazo</div>
                                  {canEdit ? (
                                    <input className="input" type="date" value={t.due_date || ""} onChange={(e) => onQuickUpdateTask(t, { due_date: e.target.value || null })} />
                                  ) : (
                                    <div className="small">{t.due_date || "-"}</div>
                                  )}
                                </div>
                              </div>

                              <div style={{ marginTop: 10 }}>
                                <div className="small muted" style={{ marginBottom: 6 }}>Observações</div>
                                {canEdit ? (
                                  <input className="input" value={t.notes || ""} onChange={(e) => onQuickUpdateTask(t, { notes: e.target.value })} placeholder="Observações" />
                                ) : (
                                  <div className="small">{t.notes || "—"}</div>
                                )}
                              </div>
                            </div>

                            <div className="compactActions">
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
                                    <button type="button" className="btn" onClick={() => onQuickUpdateTask(t, { status: "Concluída", done_at: t.done_at || new Date().toISOString().slice(0, 10) })}>
                                      Concluir
                                    </button>
                                  </>
                                ) : null}
                                {full ? (
                                  <button type="button" className="btn danger" onClick={() => onDeleteTask(t.id)}>Excluir</button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
              })
            )}
          </>
        ) : null}

        </fieldset>

        <div style={{ height: 12 }} />

        {tab !== "checklist" ? (
          <div className="row">
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
              Voltar
            </button>
            <button className="btn primary" type="submit" disabled={saving || loading || !form || isLocked}>
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
                    <select
                      className="input"
                      value={COST_CATEGORIES.includes(editDraft.category) ? editDraft.category : "__other"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__other") onDraft("category", "");
                        else onDraft("category", v);
                      }}
                    >
                      <option value="__other">Outra (personalizada)</option>
                      {COST_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {!COST_CATEGORIES.includes(editDraft.category) ? (
                      <input
                        className="input"
                        style={{ marginTop: 8 }}
                        placeholder="Digite a categoria"
                        list="costCategories"
                        value={editDraft.category || ""}
                        onChange={(e) => onDraft("category", e.target.value)}
                      />
                      <datalist id="costCategories">
                        <option value="Hotel / Hospedagem" />
                        <option value="Passagens / Transporte" />
                        <option value="Alimentação" />
                        <option value="Material / Brindes" />
                        <option value="Equipe / Terceiros" />
                        <option value="Infra / Locação" />
                        <option value="Plataformas / Ferramentas" />
                        <option value="Outros" />
                      </datalist>
                    ) : null}
                  </Field>
                  <Field label="Valor (R$)">
                    <input className="input" inputMode="decimal" placeholder="Ex.: 550,00" value={editDraft.value ?? ""} onChange={(e) => onDraft("value", e.target.value)} />
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
                  <Field label="Tipo">
                    <select className="input" value={editDraft.material_type || ""} onChange={(e) => onDraft("material_type", e.target.value)}>
                      <option value="">—</option>
                      <option value="PPT">PPT</option>
                      <option value="PDF">PDF</option>
                      <option value="DOC">DOC</option>
                      <option value="Outro">Outro</option>
                    </select>
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
                    <select
                      className="input"
                      value={PDCA_CATEGORIES.includes(editDraft.classification) ? editDraft.classification : "__other"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__other") onDraft("classification", "");
                        else onDraft("classification", v);
                      }}
                    >
                      <option value="__other">Outra (personalizada)</option>
                      {PDCA_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {!PDCA_CATEGORIES.includes(editDraft.classification) ? (
                      <input
                        className="input"
                        style={{ marginTop: 8 }}
                        placeholder="Digite a classificação"
                        value={editDraft.classification || ""}
                        onChange={(e) => onDraft("classification", e.target.value)}
                      />
                    ) : null}
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

      {closeFlow?.open ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="dialog" style={{ maxWidth: 820 }}>
            <div className="dialogHeader">
              <div>
                <div className="h2" style={{ margin: 0 }}>Concluir imersão</div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  Este fluxo valida se não existem tarefas pendentes/atrasadas ou sem responsável.
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setCloseFlow({ open: false, loading: false, error: "", summary: null, sample: [], canClose: false, confirm: false })}
                  disabled={!!closeFlow.loading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={confirmCloseImmersionFlow}
                  disabled={!!closeFlow.loading || !closeFlow.canClose}
                  title={!closeFlow.canClose ? "Existe pendência no checklist." : ""}
                >
                  {closeFlow.loading ? "Concluindo..." : "Concluir agora"}
                </button>
              </div>
            </div>

            <div className="dialogBody">
              {closeFlow.error ? (
                <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{closeFlow.error}</div>
              ) : null}

              {closeFlow.loading && !closeFlow.summary ? (
                <div className="small">Validando checklist...</div>
              ) : null}

              {closeFlow.summary ? (
                <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                    Pendentes: {closeFlow.summary.open}
                  </span>
                  <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                    Atrasadas: {closeFlow.summary.overdue}
                  </span>
                  <span className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
                    Sem responsável: {closeFlow.summary.orphan}
                  </span>
                </div>
              ) : null}

              {!closeFlow.loading && closeFlow.summary && !closeFlow.canClose ? (
                <>
                  <div className="small" style={{ marginBottom: 10 }}>
                    Para concluir, resolva as pendências abaixo (amostra). Use o checklist para corrigir rapidamente.
                  </div>
                  {closeFlow.sample?.length ? (
                    <div className="tableWrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tarefa</th>
                            <th>Fase</th>
                            <th>Prazo</th>
                            <th>Responsável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {closeFlow.sample.map((t) => {
                            const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                            return (
                              <tr key={t.id}>
                                <td>{t.title}</td>
                                <td>{t.phase || "-"}</td>
                                <td>{t.due_date || "-"}</td>
                                <td>{prof ? prof.name : "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => {
                        setCloseFlow({ open: false, loading: false, error: "", summary: null, sample: [], canClose: false, confirm: false });
                        setTab("checklist");
                      }}
                    >
                      Ir para Checklist
                    </button>
                  </div>
                </>
              ) : null}

              {!closeFlow.loading && closeFlow.summary && closeFlow.canClose ? (
                <>
                  <div className="small" style={{ marginBottom: 12 }}>
                    Checklist validado. Ao concluir, a imersão ficará marcada como <b>Concluída</b>.
                  </div>
                  <label className="row" style={{ gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!closeFlow.confirm}
                      onChange={(e) => setCloseFlow((p) => ({ ...p, confirm: e.target.checked, error: "" }))}
                    />
                    <span className="small">Confirmo que a imersão está pronta para ser concluída.</span>
                  </label>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      
{cloneFlow?.open ? (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="dialog" style={{ maxWidth: 920 }}>
            <div className="dialogHeader">
              <div>
                <div className="h2" style={{ margin: 0 }}>Clonar imersão</div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  Copia responsáveis e permite trazer tarefas predefinidas, cronograma, materiais, ferramentas e vídeos da imersão origem.
                </div>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn" onClick={() => setCloneFlow({ open: false, loading: false, error: "" })} disabled={cloneFlow.loading}>
                  Cancelar
                </button>
                <button type="button" className="btn primary" onClick={confirmCloneImmersionFlow} disabled={cloneFlow.loading}>
                  {cloneFlow.loading ? "Clonando..." : "Criar cópia"}
                </button>
              </div>
            </div>

            <div className="dialogBody">
              {cloneFlow.error ? (
                <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{cloneFlow.error}</div>
              ) : null}

              <div className="grid2">
                <Field label="Nome da nova imersão" hint="Obrigatório">
                  <input className="input" value={cloneForm.immersion_name} onChange={(e) => setCloneForm((p) => ({ ...p, immersion_name: e.target.value }))} />
                </Field>

                <Field label="Tipo" hint="Obrigatório">
                  <select className="input" value={cloneForm.type} onChange={(e) => setCloneForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="">Selecione</option>
                    {IMMERSION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Data de início" hint="Obrigatório">
                  <input className="input" type="date" value={cloneForm.start_date} onChange={(e) => setCloneForm((p) => ({ ...p, start_date: e.target.value }))} />
                </Field>
                <Field label="Data de fim" hint="Obrigatório">
                  <input className="input" type="date" value={cloneForm.end_date} onChange={(e) => setCloneForm((p) => ({ ...p, end_date: e.target.value }))} />
                </Field>
              </div>

              <div className="grid2">
                <Field label="Sala / Local">
                  <select className="input" value={cloneForm.room_location} onChange={(e) => setCloneForm((p) => ({ ...p, room_location: e.target.value }))}>
                    {ROOMS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Tarefas predefinidas">
                  <label className="row" style={{ gap: 10, alignItems: "center" }}>
                    <input type="checkbox" checked={!!cloneForm.include_templates} onChange={(e) => setCloneForm((p) => ({ ...p, include_templates: e.target.checked }))} />
                    <span className="small">Carregar tarefas automaticamente</span>
                  </label>
                  {cloneForm.include_templates ? (
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      <button type="button" className={`btn ${cloneForm.phases["PA-PRE"] ? "primary" : ""}`} onClick={() => setCloneForm((p) => ({ ...p, phases: { ...p.phases, "PA-PRE": !p.phases["PA-PRE"] } }))}>
                        PA-PRÉ
                      </button>
                      <button type="button" className={`btn ${cloneForm.phases.DURANTE ? "primary" : ""}`} onClick={() => setCloneForm((p) => ({ ...p, phases: { ...p.phases, DURANTE: !p.phases.DURANTE } }))}>
                        DURANTE
                      </button>
                      <button type="button" className={`btn ${cloneForm.phases.POS ? "primary" : ""}`} onClick={() => setCloneForm((p) => ({ ...p, phases: { ...p.phases, POS: !p.phases.POS } }))}>
                        PÓS
                      </button>
                    </div>
                  ) : null}
                </Field>

                <Field label="Copiar conteúdo">
                  <div className="small muted" style={{ marginBottom: 8 }}>
                    Recomendado ao clonar: mantém o mesmo cronograma, materiais, ferramentas e vídeos da imersão origem.
                  </div>
                  <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                    <label className="row" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!cloneForm.include_schedule}
                        onChange={(e) => setCloneForm((p) => ({ ...p, include_schedule: e.target.checked }))}
                      />
                      <span className="small">Copiar cronograma</span>
                    </label>
                    <label className="row" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!cloneForm.include_materials}
                        onChange={(e) => setCloneForm((p) => ({ ...p, include_materials: e.target.checked }))}
                      />
                      <span className="small">Copiar materiais</span>
                    </label>
                    <label className="row" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!cloneForm.include_tools}
                        onChange={(e) => setCloneForm((p) => ({ ...p, include_tools: e.target.checked }))}
                      />
                      <span className="small">Copiar ferramentas</span>
                    </label>
                    <label className="row" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!cloneForm.include_videos}
                        onChange={(e) => setCloneForm((p) => ({ ...p, include_videos: e.target.checked }))}
                      />
                      <span className="small">Copiar vídeos</span>
                    </label>
                  </div>
                </Field>
              </div>

              <div className="small muted">
                Responsáveis (Consultor e Designer) são copiados da imersão origem.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {closeBlock?.open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setCloseBlock({ open: false, summary: null, sample: [] })}
        >
          <div
            className="card"
            style={{ maxWidth: 760, width: "100%", cursor: "default" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h2">Não é possível concluir a imersão</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Para garantir governança, a imersão só pode ser marcada como <b>Concluída</b> quando não houver pendências no checklist.
            </div>

            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <span className="badge warn">{closeBlock?.summary?.open || 0} tarefa(s) em aberto</span>
              <span className="badge danger">{closeBlock?.summary?.overdue || 0} atrasada(s)</span>
              <span className="badge">{closeBlock?.summary?.orphan || 0} sem responsável</span>
            </div>

            {closeBlock.sample?.length ? (
              <div className="tableWrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tarefa</th>
                      <th>Fase</th>
                      <th>Responsável</th>
                      <th>Prazo</th>
                      <th>Status prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closeBlock.sample.map((t) => {
                      const prof = t.responsible_id ? profileById.get(t.responsible_id) : null;
                      const ds = deadlineStatus(t);
                      return (
                        <tr key={t.id}>
                          <td>{t.title}</td>
                          <td>{t.phase || "-"}</td>
                          <td>{prof ? prof.name : "-"}</td>
                          <td>{t.due_date || "-"}</td>
                          <td><span className={`badge ${ds.kind}`}>{ds.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => setCloseBlock({ open: false, summary: null, sample: [] })}>
                Entendi
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setCloseBlock({ open: false, summary: null, sample: [] });
                  setTab("checklist");
                }}
              >
                Ir para Checklist
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </Layout>
  );
}
function parseBRLNumber(v) {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // Remove currency symbols and spaces
  const cleaned = s.replace(/[^0-9,.-]/g, "");
  // If it uses comma as decimal separator, convert to dot and remove thousand separators
  const normalized = cleaned
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
