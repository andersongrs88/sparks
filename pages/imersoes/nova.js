import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";
import { listProfiles } from "../../lib/profiles";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];

const IMMERSION_TYPES = [
  "Presencial",
  "Online",
  "Zoom",
  "Entrada",
  "Extras",
  "Giants",
  "Outras",
];

const STATUSES = ["Planejamento", "Confirmada", "Em andamento", "Concluída", "Cancelada"];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="labelRow">
        <label className="label">{label}</label>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Stepper({ steps, current }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {steps.map((s, idx) => {
          const active = idx === current;
          const done = idx < current;
          return (
            <div
              key={s.key}
              className="pill"
              style={{
                borderColor: active ? "var(--primary)" : "var(--border)",
                background: active ? "var(--primary-soft)" : "var(--card)",
                color: active ? "var(--text)" : "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
              }}
              title={s.description}
            >
              <span
                className="badge"
                style={{
                  background: done ? "var(--success-soft)" : "var(--bg2)",
                  border: "1px solid var(--border)",
                  color: done ? "var(--success)" : "var(--muted)",
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
              >
                {done ? "✓" : idx + 1}
              </span>
              <span className="small" style={{ fontWeight: 600, color: active ? "var(--text)" : "var(--muted)" }}>
                {s.title}
              </span>
            </div>
          );
        })}
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        {steps[current]?.description}
      </div>
    </div>
  );
}

function daysUntil(dateISO) {
  if (!dateISO) return null;
  const today = new Date();
  const d = new Date(dateISO + "T00:00:00");
  const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function NovaImersaoPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [people, setPeople] = useState([]);

  // Form (wizard)
  const [form, setForm] = useState({
    immersion_name: "",
    type: "", // <- novo "Tipo" (sua lista)
    start_date: "",
    end_date: "",
    room_location: ROOMS[0],
    status: "Planejamento",

    educational_consultant: "",
    instructional_designer: "",

    mentors_present: "",
    need_specific_staff: false,
    staff_justification: "",
    service_order_link: "",
    technical_sheet_link: "",
  });

  const steps = useMemo(
    () => [
      {
        key: "essencial",
        title: "Essencial",
        description: "Defina o mínimo para a imersão existir: nome, tipo e datas.",
      },
      {
        key: "operacao",
        title: "Operação",
        description: "Defina local e status. Opcionalmente, links e recursos.",
      },
      {
        key: "time",
        title: "Time de Educação",
        description: "Escolha os 2 responsáveis (Consultor e Designer). Isso alimenta notificações e relatórios.",
      },
    ],
    []
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await listProfiles();
        const active = (all || []).filter((p) => !!p.is_active);
        if (mounted) setPeople(active);
      } catch {
        // silencioso: o cadastro ainda funciona sem a lista de pessoas
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const countdown = useMemo(() => daysUntil(form.start_date), [form.start_date]);

  function validateStep(targetStep = step) {
    setError("");

    if (!isFullAccess) {
      setError("Apenas administradores podem criar uma nova imersão.");
      return false;
    }

    // Etapa 1: Essencial
    if (targetStep >= 0) {
      if (!form.immersion_name?.trim()) {
        setError("Informe o nome da imersão.");
        return false;
      }
      if (!form.type) {
        setError("Selecione o tipo da imersão.");
        return false;
      }
      if (!form.start_date || !form.end_date) {
        setError("Informe data inicial e final.");
        return false;
      }
      if (new Date(form.end_date) < new Date(form.start_date)) {
        setError("A data final não pode ser anterior à data inicial.");
        return false;
      }
    }

    // Etapa 2: Operação (sem obrigatórios adicionais além de Essencial)
    if (targetStep >= 1) {
      if (!form.room_location) {
        setError("Selecione a sala/local.");
        return false;
      }
      if (!form.status) {
        setError("Selecione o status.");
        return false;
      }
      if (form.need_specific_staff && !form.staff_justification?.trim()) {
        setError("Explique a justificativa do staff específico.");
        return false;
      }
    }

    // Etapa 3: Time
    if (targetStep >= 2) {
      if (!form.educational_consultant || !form.instructional_designer) {
        setError("Defina os 2 responsáveis do time de educação: Consultor e Designer.");
        return false;
      }
      if (form.educational_consultant === form.instructional_designer) {
        setError("Consultor e Designer devem ser pessoas diferentes.");
        return false;
      }
    }

    return true;
  }

  function onNext() {
    setError("");
    // valida a etapa atual antes de avançar
    const ok = validateStep(step);
    if (!ok) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function onBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onFinish(e) {
    e.preventDefault();
    setError("");

    const ok = validateStep(2);
    if (!ok) return;

    setSaving(true);
    try {
      const created = await createImmersion({
        immersion_name: form.immersion_name.trim(),
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: form.status,

        // responsáveis (UUID)
        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,

        mentors_present: form.mentors_present || null,

        need_specific_staff: !!form.need_specific_staff,
        staff_justification: form.need_specific_staff ? (form.staff_justification || null) : null,
        service_order_link: form.service_order_link || null,
        technical_sheet_link: form.technical_sheet_link || null,
      });

      router.push(`/imersoes/${created.id}`);
    } catch (err) {
      setError(err?.message || "Erro ao criar imersão.");
    } finally {
      setSaving(false);
    }
  }

  const headerMeta = useMemo(() => {
    const parts = [];
    if (form.start_date && form.end_date) parts.push(`${form.start_date} → ${form.end_date}`);
    if (form.room_location) parts.push(`Sala: ${form.room_location}`);
    if (form.status) parts.push(`Status: ${form.status}`);
    return parts.join(" • ");
  }, [form.start_date, form.end_date, form.room_location, form.status]);

  return (
    <Layout title="Nova imersão">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="h2">Criar imersão</div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {headerMeta || "Preencha as informações essenciais e avance etapa por etapa."}
            </div>
          </div>

          {typeof countdown === "number" ? (
            <div className="badge" style={{ background: "var(--bg2)", border: "1px solid var(--border)" }}>
              {countdown >= 0 ? `${countdown} dias até` : `${Math.abs(countdown)} dias atrás`}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 14 }}>
          <Stepper steps={steps} current={step} />
        </div>

        {error ? (
          <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        <form onSubmit={onFinish}>
          {/* STEP 1 — ESSENCIAL */}
          {step === 0 ? (
            <div className="section">
              <div className="sectionTitle">Essencial</div>
              <div className="sectionBody">
                <Field label="Nome da imersão" hint="Obrigatório">
                  <input
                    className="input"
                    value={form.immersion_name}
                    onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))}
                    placeholder="Ex.: Acelerador Empresarial #79 | Presencial"
                    required
                  />
                </Field>

                <div className="grid2">
                  <Field label="Tipo" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.type}
                      onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {IMMERSION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Status inicial">
                    <select
                      className="input"
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid2">
                  <Field label="Data de início" hint="Obrigatório">
                    <input
                      className="input"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                    />
                  </Field>

                  <Field label="Data de fim" hint="Obrigatório">
                    <input
                      className="input"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                    />
                  </Field>
                </div>

                <div className="small muted" style={{ marginTop: 6 }}>
                  Dica: mantenha o cadastro simples aqui. Você poderá completar cronograma, materiais e checklist após criar.
                </div>
              </div>
            </div>
          ) : null}

          {/* STEP 2 — OPERAÇÃO */}
          {step === 1 ? (
            <>
              <div className="section">
                <div className="sectionTitle">Operação</div>
                <div className="sectionBody">
                  <div className="grid2">
                    <Field label="Sala / Local" hint="Obrigatório">
                      <select
                        className="input"
                        value={form.room_location}
                        onChange={(e) => setForm((p) => ({ ...p, room_location: e.target.value }))}
                      >
                        {ROOMS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Status">
                      <select
                        className="input"
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid2">
                    <Field label="Ordem de Serviço (link)">
                      <input
                        className="input"
                        value={form.service_order_link}
                        onChange={(e) => setForm((p) => ({ ...p, service_order_link: e.target.value }))}
                        placeholder="URL"
                      />
                    </Field>

                    <Field label="Ficha Técnica (link)">
                      <input
                        className="input"
                        value={form.technical_sheet_link}
                        onChange={(e) => setForm((p) => ({ ...p, technical_sheet_link: e.target.value }))}
                        placeholder="URL"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="sectionTitle">Recursos e staff</div>
                <div className="sectionBody">
                  <Field label="Precisa de staff específico?">
                    <label className="row" style={{ gap: 10, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={form.need_specific_staff}
                        onChange={(e) => setForm((p) => ({ ...p, need_specific_staff: e.target.checked }))}
                      />
                      <span className="small">Sim</span>
                      <span className="small muted">Use quando precisar justificar equipe adicional.</span>
                    </label>
                  </Field>

                  {form.need_specific_staff ? (
                    <Field label="Justificativa do staff" hint="Obrigatório quando marcado">
                      <textarea
                        className="input"
                        rows={3}
                        value={form.staff_justification}
                        onChange={(e) => setForm((p) => ({ ...p, staff_justification: e.target.value }))}
                        placeholder="Explique por que esta imersão precisa de staff específico."
                      />
                    </Field>
                  ) : null}

                  <Field label="Mentores presentes">
                    <input
                      className="input"
                      value={form.mentors_present}
                      onChange={(e) => setForm((p) => ({ ...p, mentors_present: e.target.value }))}
                      placeholder="Ex.: Nome 1, Nome 2"
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : null}

          {/* STEP 3 — TIME DE EDUCAÇÃO */}
          {step === 2 ? (
            <div className="section">
              <div className="sectionTitle">Time de Educação</div>
              <div className="sectionBody">
                <div className="small muted" style={{ marginBottom: 12 }}>
                  Estes campos são obrigatórios. Eles definem os responsáveis e alimentam notificações e relatórios.
                </div>

                <div className="grid2">
                  <Field label="Consultor (Educação)" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.educational_consultant}
                      onChange={(e) => setForm((p) => ({ ...p, educational_consultant: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Designer instrucional" hint="Obrigatório">
                    <select
                      className="input"
                      value={form.instructional_designer}
                      onChange={(e) => setForm((p) => ({ ...p, instructional_designer: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ? `${p.name} (${p.email})` : p.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {!people?.length ? (
                  <div className="small" style={{ color: "var(--warning)", marginTop: 8 }}>
                    Observação: não foi possível carregar a lista de usuários. Verifique a tabela <b>profiles</b> (ou
                    continue e selecione depois na edição).
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Footer actions */}
          <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
              Cancelar
            </button>

            <div className="row" style={{ gap: 10 }}>
              <button className="btn" type="button" onClick={onBack} disabled={step === 0 || saving}>
                Voltar
              </button>

              {step < 2 ? (
                <button className="btn primary" type="button" onClick={onNext} disabled={saving}>
                  Continuar
                </button>
              ) : (
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Criando..." : "Criar imersão"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}
