import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { createImmersion } from "../../lib/immersions";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];

const initial = {
  immersion_name: "",
  start_date: "",
  end_date: "",
  room_location: "Brasil",

  educational_consultant: "",
  instructional_designer: "",

  service_order_link: "",
  technical_sheet_link: "",

  mentors_present: "",
  need_specific_staff: false,
  staff_justification: "",

  immersion_narrative: "",
  narrative_information: "",
  dynamics_information: "",

  trainer_main_information: "",
  vignette_name: "",
  vignette_text: "",
  contract_link: "",
  photos_link: "",
  authority_video_link: "",
  professional_summary: "",
  instagram_profile: "",
  food_preferences_rider: "",
  important_observations: "",
  place_of_residence: "",

  need_third_parties: false,
  third_party_speech_therapist: false,
  third_party_barber: false,
  third_party_hairdresser: false,
  third_party_makeup: false,

  will_have_speaker: false,
  status: "Planejamento"
};

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

export default function NovaImersao() {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("essencial");

  const tabs = useMemo(
    () => [
      { key: "essencial", label: "Essencial" },
      { key: "operacao", label: "Operação" },
      { key: "narrativa", label: "Narrativa" },
      { key: "trainer", label: "Trainer" },
      { key: "terceiros", label: "Terceiros" }
    ],
    []
  );

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function setYesNo(field, yes) {
    set(field, yes);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.immersion_name.trim()) return setError("Preencha o nome da imersão.");
    if (!form.start_date) return setError("Preencha a data de início.");
    if (!form.end_date) return setError("Preencha a data de fim.");

    if (form.need_specific_staff && !form.staff_justification.trim()) {
      return setError("Como você marcou staff específico: preencha a justificativa.");
    }

    try {
      setSaving(true);
      await createImmersion({
        ...form,
        immersion_name: form.immersion_name.trim(),
        staff_justification: form.need_specific_staff ? form.staff_justification : ""
      });
      router.push("/imersoes");
    } catch (err) {
      setError(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // Condicionais de UX
  const staffEnabled = form.need_specific_staff === true;
  const speakerEnabled = form.will_have_speaker === true;

  return (
    <Layout title="Cadastrar imersão">
      <form className="card" onSubmit={onSubmit}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {/* ABA: ESSENCIAL */}
        {tab === "essencial" ? (
          <>
            <div className="h2">Identificação</div>

            <Field label="Imersão">
              <input
                className="input"
                value={form.immersion_name}
                onChange={(e) => set("immersion_name", e.target.value)}
              />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Data de início">
                  <input
                    className="input"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => set("start_date", e.target.value)}
                  />
                </Field>
              </div>

              <div className="col">
                <Field label="Data de fim">
                  <input
                    className="input"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => set("end_date", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Field label="Sala a ser realizada">
              <select
                className="input"
                value={form.room_location}
                onChange={(e) => set("room_location", e.target.value)}
              >
                {ROOMS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                className="input"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="Planejamento">Planejamento</option>
                <option value="Em execução">Em execução</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </Field>
          </>
        ) : null}

        {/* ABA: OPERAÇÃO */}
        {tab === "operacao" ? (
          <>
            <div className="h2">Time e links</div>

            <div className="row">
              <div className="col">
                <Field label="Consultor educacional">
                  <input
                    className="input"
                    value={form.educational_consultant}
                    onChange={(e) => set("educational_consultant", e.target.value)}
                  />
                </Field>
              </div>
              <div className="col">
