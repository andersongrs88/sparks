import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { deleteImmersion, getImmersion, updateImmersion } from "../../lib/immersions";
import { listTasksByImmersion, createTask, updateTask, deleteTask } from "../../lib/tasks";
import { listActiveProfiles } from "../../lib/profiles";
import { listActiveTaskTemplates } from "../../lib/taskTemplates";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];

const PHASES = [
  { key: "PA-PRE", label: "PA-PRÉ" },
  { key: "DURANTE", label: "DURANTE" },
  { key: "POS", label: "PÓS" }
];

const TASK_STATUSES = ["Programada", "Em andamento", "Concluída"];

const IMMERSION_STATUS_OPTIONS = ["Planejamento", "Em execução", "Concluída", "Cancelada"];

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

function getCountdownSignal(days) {
  if (days === null) return null;

  // >= 60 verde | >= 40 azul | >= 30 azul escuro | >= 20 laranja | >= 10 bordô | <= 0 bordô
  if (days <= 0) return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };
  if (days >= 60) return { label: `${days} dias`, style: { background: "#0d3b1e", borderColor: "#1b6b36" } };
  if (days >= 40) return { label: `${days} dias`, style: { background: "#0b2b52", borderColor: "#1f4f99" } };
  if (days >= 30) return { label: `${days} dias`, style: { background: "#071a35", borderColor: "#163a7a" } };
  if (days >= 20) return { label: `${days} dias`, style: { background: "#4a2a00", borderColor: "#b86b00" } };
  if (days >= 10) return { label: `${days} dias`, style: { background: "#3b0a0a", borderColor: "#6b0f0f" } };

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

function addDays(dateStr, offsetDays) {
  if (!dateStr) return null;
  if (offsetDays === null || offsetDays === undefined) return null;
  if (Number.isNaN(Number(offsetDays))) return null;

  const base = toLocalDateOnly(dateStr);
  if (!base) return null;
  base.setDate(base.getDate() + Number(offsetDays));

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

  // Checklist
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [generating, setGenerating] = useState(false);

  // criação de tarefa
  const [newTaskOpen, setNewTaskOpen] = useState(false);
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
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;

    async function loadProfiles() {
      try {
        const data = await listActiveProfiles();
        if (!mounted) return;

        setProfiles(data);

        if (data.length > 0) {
          setNewTask((prev) => ({ ...prev, owner_profile_id: data[0].id }));
        }
      } catch (e) {
        console.error(e);
      }
    }

    loadProfiles();
    return () => {
      mounted = false;
    };
  }, []);

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

  const profileById = useMemo(() => {
    const map = new Map();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  // ====== FILTROS PARA A ABA OPERAÇÃO (Consultor/Designer) ======
  const consultants = useMemo(() => {
    return (profiles || []).filter((p) => (p.role || "").trim().toLowerCase() === "consultor");
  }, [profiles]);

  const designers = useMemo(() => {
    const role = (p) => (p.role || "").trim().toLowerCase();
    return (profiles || []).filter((p) => role(p) === "designer" || role(p).includes("designer"));
  }, [profiles]);

  const tasksByPhase = useMemo(() => {
    const map = { "PA-PRE": [], DURANTE: [], POS: [] };
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

  async function onGenerateChecklist() {
    if (!form?.id) return;

    const ok = confirm(
      "Gerar checklist padrão agora?\n\nO sistema vai criar as tarefas que ainda não existirem nesta imersão (sem duplicar)."
    );
    if (!ok) return;

    setTaskError("");
    setGenerating(true);

    try {
      const templates = await listActiveTaskTemplates();

      const existing = await listTasksByImmersion(form.id);
      const existingKey = new Set((existing || []).map((t) => `${t.phase || ""}__${(t.title || "").trim().toLowerCase()}`));

      let createdCount = 0;

      for (const tpl of templates) {
        const key = `${tpl.phase || ""}__${(tpl.title || "").trim().toLowerCase()}`;
        if (existingKey.has(key)) continue;

        const baseDate = tpl.phase === "POS" ? form.end_date : form.start_date;
        const due = tpl.days_offset === null || tpl.days_offset === undefined ? null : addDays(baseDate, tpl.days_offset);

        await createTask({
          immersion_id: form.id,
          phase: tpl.phase,
          title: tpl.title,
          owner_profile_id: null,
          due_date: due,
          status: "Programada",
          notes: ""
        });

        createdCount += 1;
      }

      await loadTasks(form.id);
      alert(`Checklist padrão gerado.\n\nTarefas criadas: ${createdCount}`);
    } catch (e) {
      setTaskError(e?.message || "Falha ao gerar checklist padrão.");
    } finally {
      setGenerating(false);
    }
  }

  async function onInlineUpdate(taskId, patch) {
    setTaskError("");
    try {
      await updateTask(taskId, patch);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    } catch (e) {
      setTaskError(e?.message || "Falha ao atualizar tarefa.");
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
                {form.start_date || "-"} → {form.end_date || "-"} • Sala: {form.room_location || "-"} • Status: {form.status}
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

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}
        {!form ? <div className="small">Nada para editar.</div> : null}

        {/* =========================
            ABA: ESSENCIAL
        ========================== */}
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
                {IMMERSION_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        {/* =========================
            ABA: OPERAÇÃO
        ========================== */}
        {form && tab === "operacao" ? (
          <>
            <div className="h2">Operação</div>

            <div className="row">
              <div className="col">
                <Field label="Consultor educacional" hint="Carregado da tabela de usuários (profiles) — role Consultor">
                  <select className="input" value={form.educational_consultant || ""} onChange={(e) => set("educational_consultant", e.target.value)}>
                    <option value="">Selecione...</option>
                    {consultants.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="col">
                <Field label="Designer instrucional" hint="Carregado da tabela de usuários (profiles) — role Designer">
                  <select className="input" value={form.instructional_designer || ""} onChange={(e) => set("instructional_designer", e.target.value)}>
                    <option value="">Selecione...</option>
                    {designers.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <Field label="Link ordem de serviço">
              <input className="input" value={form.service_order_link || ""} onChange={(e) => set("service_order_link", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Link para ficha técnica">
              <input className="input" value={form.technical_sheet_link || ""} onChange={(e) => set("technical_sheet_link", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Mentores que estarão presentes" hint="Campo aberto (pode colocar nomes, times, etc.)">
              <textarea className="input" rows={4} value={form.mentors_present || ""} onChange={(e) => set("mentors_present", e.target.value)} />
            </Field>

            <Field label="Existe a necessidade de staff específico para essa imersão?">
              <select className="input" value={form.need_specific_staff ? "sim" : "nao"} onChange={(e) => set("need_specific_staff", e.target.value === "sim")}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>

            {staffEnabled ? (
              <Field label="Justificativa">
                <textarea className="input" rows={4} value={form.staff_justification || ""} onChange={(e) => set("staff_justification", e.target.value)} />
              </Field>
            ) : null}
          </>
        ) : null}

        {/* =========================
            ABA: NARRATIVA
        ========================== */}
        {form && tab === "narrativa" ? (
          <>
            <div className="h2">Narrativa</div>

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

        {/* =========================
            ABA: TRAINER
        ========================== */}
        {form && tab === "trainer" ? (
          <>
            <div className="h2">Trainer</div>

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
                <Field label="Texto para vinheta">
                  <input className="input" value={form.vignette_text || ""} onChange={(e) => set("vignette_text", e.target.value)} />
                </Field>
              </div>
            </div>

            <Field label="Contrato (link)">
              <input className="input" value={form.contract_link || ""} onChange={(e) => set("contract_link", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Link para fotos">
              <input className="input" value={form.photos_link || ""} onChange={(e) => set("photos_link", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Link para vídeo de autoridade">
              <input className="input" value={form.authority_video_link || ""} onChange={(e) => set("authority_video_link", e.target.value)} placeholder="https://..." />
            </Field>

            <Field label="Resumo profissional">
              <textarea className="input" rows={4} value={form.professional_summary || ""} onChange={(e) => set("professional_summary", e.target.value)} />
            </Field>

            <Field label="Perfil Instagram">
              <input className="input" value={form.instagram_profile || ""} onChange={(e) => set("instagram_profile", e.target.value)} placeholder="@..." />
            </Field>

            <Field label="Preferências alimentares / rider">
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

        {/* =========================
            ABA: TERCEIROS
        ========================== */}
        {form && tab === "terceiros" ? (
          <>
            <div className="h2">Terceiros</div>

            <Field label="Necessidade de terceiros">
              <select className="input" value={form.need_third_parties ? "sim" : "nao"} onChange={(e) => set("need_third_parties", e.target.value === "sim")}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>

            {form.need_third_parties ? (
              <>
                <div className="row">
                  <div className="col">
                    <Field label="Fonoaudióloga">
                      <select className="input" value={form.third_party_speech_therapist ? "sim" : "nao"} onChange={(e) => set("third_party_speech_therapist", e.target.value === "sim")}>
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </Field>
                  </div>

                  <div className="col">
                    <Field label="Barbeiro">
                      <select className="input" value={form.third_party_barber ? "sim" : "nao"} onChange={(e) => set("third_party_barber", e.target.value === "sim")}>
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <div className="row">
                  <div className="col">
                    <Field label="Cabeleleiro">
                      <select className="input" value={form.third_party_hairdresser ? "sim" : "nao"} onChange={(e) => set("third_party_hairdresser", e.target.value === "sim")}>
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </Field>
                  </div>

                  <div className="col">
                    <Field label="Maquiagem">
                      <select className="input" value={form.third_party_makeup ? "sim" : "nao"} onChange={(e) => set("third_party_makeup", e.target.value === "sim")}>
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </>
            ) : (
              <div className="small">Sem terceiros para esta imersão.</div>
            )}

            <Field label="Vai ter palestrante?">
              <select className="input" value={form.will_have_speaker ? "sim" : "nao"} onChange={(e) => set("will_have_speaker", e.target.value === "sim")}>
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>

            {speakerEnabled ? <div className="small">Cadastro de palestrante será desenvolvido no futuro.</div> : null}
          </>
        ) : null}

        {/* =========================
            ABA: CHECKLIST
        ========================== */}
        {form && tab === "checklist" ? (
          <>
            <div className="h2">Checklist</div>

            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="small">
                Total: <b>{checklistSummary.total}</b> • Concluídas: <b>{checklistSummary.done}</b> • Atrasadas: <b>{checklistSummary.late}</b>
              </div>

              <div className="row">
                <button type="button" className="btn" onClick={() => loadTasks(form.id)} disabled={tasksLoading || generating}>
                  {tasksLoading ? "Atualizando..." : "Atualizar"}
                </button>

                <button type="button" className="btn" onClick={onGenerateChecklist} disabled={generating || tasksLoading}>
                  {generating ? "Gerando..." : "Gerar checklist padrão"}
                </button>

                <button type="button" className="btn primary" onClick={() => setNewTaskOpen((v) => !v)} disabled={generating}>
                  {newTaskOpen ? "Fechar" : "Nova tarefa"}
                </button>
              </div>
            </div>

            {taskError ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{taskError}</div> : null}
            {tasksLoading ? <div className="small" style={{ marginBottom: 10 }}>Carregando tarefas...</div> : null}

            {newTaskOpen ? (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="h2">Nova tarefa</div>

                <div className="row">
                  <div className="col">
                    <Field label="Fase">
                      <select className="input" value={newTask.phase} onChange={(e) => setNewTask((p) => ({ ...p, phase: e.target.value }))}>
                        {PHASES.map((ph) => (
                          <option key={ph.key} value={ph.key}>
                            {ph.label}
                          </option>
                        ))}
                      </select>
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

                <Field label="Título">
                  <input className="input" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} />
                </Field>

                <div className="row">
                  <div className="col">
                    <Field label="Responsável">
                      <select className="input" value={newTask.owner_profile_id || ""} onChange={(e) => setNewTask((p) => ({ ...p, owner_profile_id: e.target.value }))}>
                        <option value="">Selecione...</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.role})
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="col">
                    <Field label="Prazo">
                      <input className="input" type="date" value={newTask.due_date || ""} onChange={(e) => setNewTask((p) => ({ ...p, due_date: e.target.value }))} />
                    </Field>
                  </div>
                </div>

                <Field label="Observações (opcional)">
                  <textarea
                    className="input"
                    rows={3}
                    value={newTask.notes || ""}
                    onChange={(e) => setNewTask((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Contexto, link, instruções..."
                  />
                </Field>

                <div className="row">
                  <button className="btn primary" type="button" onClick={onCreateTask} disabled={taskSaving}>
                    {taskSaving ? "Salvando..." : "Criar tarefa"}
                  </button>
                  <button className="btn" type="button" onClick={() => setNewTaskOpen(false)} disabled={taskSaving}>
                    Cancelar
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
                          <th>Observações</th>
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
                                {late ? <div className="small" style={{ color: "var(--danger)" }}>Atrasada</div> : null}
                                {prof ? <div className="small">Resp.: {prof.name}</div> : <div className="small">Resp.: -</div>}
                              </td>

                              <td>
                                <select className="input" value={t.owner_profile_id || ""} onChange={(e) => onInlineUpdate(t.id, { owner_profile_id: e.target.value || null })}>
                                  <option value="">(sem responsável)</option>
                                  {profiles.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.role})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td>
                                <input className="input" type="date" value={t.due_date || ""} onChange={(e) => onInlineUpdate(t.id, { due_date: e.target.value || null })} />
                              </td>

                              <td>
                                <select className="input" value={t.status} onChange={(e) => onInlineUpdate(t.id, { status: e.target.value })}>
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td style={{ minWidth: 260 }}>
                                <textarea
                                  className="input"
                                  rows={2}
                                  value={t.notes || ""}
                                  onChange={(e) => onInlineUpdate(t.id, { notes: e.target.value })}
                                  placeholder="Observações..."
                                  style={{ resize: "vertical" }}
                                />
                              </td>

                              <td>
                                <div className="row">
                                  <button type="button" className="btn" onClick={() => onInlineUpdate(t.id, { status: "Concluída" })}>
                                    Concluir
                                  </button>
                                  <button type="button" className="btn danger" onClick={() => onDeleteTask(t.id)}>
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

        <div className="row">
          <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
            Voltar
          </button>

          {tab !== "checklist" ? (
            <button className="btn primary" type="submit" disabled={saving || loading || !form}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          ) : null}
        </div>
      </form>
    </Layout>
  );
}
