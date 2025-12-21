import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { deleteImmersion, getImmersion, updateImmersion } from "../../lib/immersions";
import { listTasksByImmersion, createTask, updateTask, deleteTask } from "../../lib/tasks";
import { listActiveProfiles } from "../../lib/profiles";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];
const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];

const ROLES = [
  { key: "CONSULTOR", label: "Consultor" },
  { key: "DESIGNER", label: "Designer" },
  { key: "BASICO", label: "Básico" },
  { key: "ADMIN", label: "Administrador" }
];

const TASK_STATUSES = ["Programada", "Em andamento", "Concluída"];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {hint ? <div className="small" style={{ marginBottom: 6 }}>{hint}</div> : null}
      {children}
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`btn ${active === t.key ? "primary" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function toLocalDateOnly(d) {
  // Aceita "YYYY-MM-DD" ou ISO com horário
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

function isLate(dueDateStr, status) {
  if (!dueDateStr) return false;
  if (status === "Concluída") return false;
  const due = new Date(dueDateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return due.getTime() < today.getTime();
}
function getCountdownSignal(days) {
  if (days === null) return null;

  // Se já passou, trata como crítico
  if (days <= 0) {
    return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } }; // bordo
  }

  // Faixas (pode ajustar depois)
  if (days >= 60) return { label: `${days} dias`, style: { background: "#0d3b1e", borderColor: "#1b6b36" } }; // verde
  if (days >= 40) return { label: `${days} dias`, style: { background: "#0b2b52", borderColor: "#1f4f99" } }; // azul
  if (days >= 30) return { label: `${days} dias`, style: { background: "#071a35", borderColor: "#163a7a" } }; // azul escuro
  if (days >= 20) return { label: `${days} dias`, style: { background: "#4a2a00", borderColor: "#b86b00" } }; // laranja
  if (days >= 10) return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } }; // vermelho bordo

  // 1 a 9 dias
  return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
}


export default function ImmersionDetailEditPage() {
  const router = useRouter();
  const { id } = router.query;

  const [tab, setTab] = useState("essencial");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(null);

  // checklist
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

  // criação de tarefa
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("CONSULTOR");
  const [newTask, setNewTask] = useState({
    phase: "PA-PRE",
    title: "",
    owner_profile_id: "",
    due_date: "",
    status: "Programada",
    notes: ""
  });

  const tabs = useMemo(
    () => [
      { key: "essencial", label: "Essencial" },
      { key: "operacao", label: "Operação" },
      { key: "narrativa", label: "Narrativa" },
      { key: "trainer", label: "Trainer" },
      { key: "terceiros", label: "Terceiros" },
      { key: "checklist", label: "Checklist" }
    ],
    []
  );

  useEffect(() => {
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
    return () => { mounted = false; };
  }, [id]);

  // Carregar profiles (usuários) uma vez
  useEffect(() => {
    let mounted = true;

    async function loadProfiles() {
      try {
        const data = await listActiveProfiles();
        if (!mounted) return;
        setProfiles(data);

        // Seleciona automaticamente um responsável padrão (primeiro do filtro)
        const filtered = data.filter((p) => p.role === roleFilter);
        if (filtered.length > 0) {
          setNewTask((prev) => ({ ...prev, owner_profile_id: filtered[0].id }));
        } else if (data.length > 0) {
          setNewTask((prev) => ({ ...prev, owner_profile_id: data[0].id }));
        }
      } catch (e) {
        // não trava o sistema, mas registra
        console.error(e);
      }
    }

    loadProfiles();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se mudar o filtro, ajusta owner_profile_id para o primeiro do filtro
  useEffect(() => {
    if (!profiles || profiles.length === 0) return;
    const filtered = profiles.filter((p) => p.role === roleFilter);
    if (filtered.length > 0) {
      setNewTask((prev) => ({ ...prev, owner_profile_id: filtered[0].id }));
    }
  }, [roleFilter, profiles]);

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

  // Carrega tasks quando entrar na aba Checklist
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    if (tab !== "checklist") return;
    loadTasks(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSaveImmersion(e) {
    e.preventDefault();
    if (!form) return;

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

    setTaskError("");

    if (!newTask.title.trim()) {
      setTaskError("Preencha o título da tarefa.");
      return;
    }

    if (!newTask.owner_profile_id) {
      setTaskError("Selecione um responsável.");
      return;
    }

    try {
      setTaskSaving(true);
      await createTask({
        immersion_id: id,
        phase: newTask.phase,
        title: newTask.title.trim(),
        owner_profile_id: newTask.owner_profile_id,
        due_date: newTask.due_date || null,
        status: newTask.status,
        notes: newTask.notes || ""
      });

      setNewTaskOpen(false);
      setNewTask((p) => ({ ...p, title: "", due_date: "", notes: "", status: "Programada" }));
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao criar tarefa.");
    } finally {
      setTaskSaving(false);
    }
  }

  async function onQuickUpdateTask(taskId, patch) {
    setTaskError("");
    try {
      await updateTask(taskId, patch);
      await loadTasks(id);
    } catch (e) {
      setTaskError(e?.message || "Falha ao atualizar tarefa.");
    }
  }

  async function onDeleteTask(taskId) {
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

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => p.role === roleFilter);
  }, [profiles, roleFilter]);

  return (
    <Layout title="Editar imersão">
      <div className="card" style={{ marginBottom: 12 }}>
        {loading ? (
          <div className="small">Carregando...</div>
        ) : form ? (
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="h1" style={{ margin: 0 }}>{form.immersion_name}</div>
              <div className="small">
                {form.start_date} → {form.end_date} • Sala: {form.room_location || "-"} • Status: {form.status}
              </div>
            </div>

            <div className="row">
{(() => {
  const signal = getCountdownSignal(d);
  if (!signal) return null;

  return (
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
  );
})()}
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

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        {!form ? <div className="small">Nada para editar.</div> : null}

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
                  <option key={r} value={r}>{r}</option>
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
                <button type="button" className="btn primary" onClick={() => setNewTaskOpen((v) => !v)}>
                  {newTaskOpen ? "Fechar" : "Nova tarefa"}
                </button>
              </div>
            </div>

            {taskError ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{taskError}</div> : null}
            {tasksLoading ? <div className="small" style={{ marginBottom: 10 }}>Carregando tarefas...</div> : null}

            {newTaskOpen ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2">Nova tarefa</div>

                <Field label="Fase">
                  <select
                    className="input"
                    value={newTask.phase}
                    onChange={(e) => setNewTask((p) => ({ ...p, phase: e.target.value }))}
                  >
                    {PHASES.map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Título">
                  <input
                    className="input"
                    value={newTask.title}
                    onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex.: Criar pasta no Drive"
                  />
                </Field>

                <Field label="Tipo do usuário (filtro)">
                  <select
                    className="input"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Responsável">
                  <select
                    className="input"
                    value={newTask.owner_profile_id}
                    onChange={(e) => setNewTask((p) => ({ ...p, owner_profile_id: e.target.value }))}
                  >
                    {filteredProfiles.length === 0 ? (
                      <option value="">Nenhum usuário ativo desse tipo</option>
                    ) : null}

                    {filteredProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>

                  {filteredProfiles.length === 0 ? (
                    <div className="small" style={{ marginTop: 6 }}>
                      Cadastre um usuário desse tipo na tabela <b>profiles</b> (Supabase).
                    </div>
                  ) : null}
                </Field>

                <div className="row">
                  <div className="col">
                    <Field label="Prazo">
                      <input
                        className="input"
                        type="date"
                        value={newTask.due_date}
                        onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))}
                      />
                    </Field>
                  </div>

                  <div className="col">
                    <Field label="Status">
                      <select
                        className="input"
                        value={newTask.status}
                        onChange={(e) => setNewTask((p) => ({ ...p, status: e.target.value }))}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>

                <Field label="Observações">
                  <textarea
                    className="input"
                    rows={3}
                    value={newTask.notes}
                    onChange={(e) => setNewTask((p) => ({ ...p, notes: e.target.value }))}
                  />
                </Field>

                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setNewTaskOpen(false)}
                    disabled={taskSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={onCreateTask}
                    disabled={taskSaving}
                  >
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

                  {list.length === 0 ? (
                    <div className="small">Nenhuma tarefa nesta fase.</div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Tarefa</th>
                          <th>Responsável</th>
                          <th>Prazo</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((t) => {
                          const prof = t.owner_profile_id ? profileById.get(t.owner_profile_id) : null;
                          const late = isLate(t.due_date, t.status);

                          return (
                            <tr key={t.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{t.title}</div>
                                {t.notes ? <div className="small">{t.notes}</div> : null}
                                {late ? <div className="small" style={{ color: "var(--danger)" }}>Atrasada</div> : null}
                              </td>

                              <td>{prof ? `${prof.name} (${prof.role})` : "-"}</td>
                              <td>{t.due_date || "-"}</td>

                              <td>
                                <select
                                  className="input"
                                  value={t.status}
                                  onChange={(e) => onQuickUpdateTask(t.id, { status: e.target.value })}
                                >
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </td>

                              <td>
                                <div className="row">
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => onQuickUpdateTask(t.id, { status: "Concluída" })}
                                  >
                                    Concluir
                                  </button>
                                  <button
                                    type="button"
                                    className="btn danger"
                                    onClick={() => onDeleteTask(t.id)}
                                  >
                                    Excluir
                                  </button>
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
    </Layout>
  );
}


