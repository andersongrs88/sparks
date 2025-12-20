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

  const staffEnabled = form.need_specific_staff === true;
  const speakerEnabled = form.will_have_speaker === true;

  return (
    <Layout title="Cadastrar imersão">
      <form className="card" onSubmit={onSubmit}>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

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
                <Field label="Designer instrucional">
                  <input
                    className="input"
                    value={form.instructional_designer}
                    onChange={(e) => set("instructional_designer", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Field label="Link ordem de serviço">
              <input
                className="input"
                value={form.service_order_link}
                onChange={(e) => set("service_order_link", e.target.value)}
              />
            </Field>

            <Field label="Link para ficha técnica">
              <input
                className="input"
                value={form.technical_sheet_link}
                onChange={(e) => set("technical_sheet_link", e.target.value)}
              />
            </Field>

            <div style={{ height: 10 }} />

            <div className="h2">Mentores e staff</div>

            <Field label="Mentores que estarão presentes" hint="Campo aberto (cole lista, nomes, observações).">
              <textarea
                className="input"
                rows={4}
                value={form.mentors_present}
                onChange={(e) => set("mentors_present", e.target.value)}
              />
            </Field>

            <Field label="Existe a necessidade de staff específico para essa imersão?">
              <div className="row">
                <button
                  type="button"
                  className={`btn ${form.need_specific_staff ? "primary" : ""}`}
                  onClick={() => set("need_specific_staff", true)}
                >
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

            <Field
              label="Justificativa"
              hint={staffEnabled ? "Obrigatório quando staff específico = Sim." : "Habilita ao marcar Sim."}
            >
              <textarea
                className="input"
                rows={3}
                disabled={!staffEnabled}
                value={form.staff_justification}
                onChange={(e) => set("staff_justification", e.target.value)}
                placeholder={staffEnabled ? "Descreva a necessidade de staff." : "Habilitado quando 'Sim'."}
              />
            </Field>

            <Field label="Vai ter palestrante?">
              <div className="row">
                <button
                  type="button"
                  className={`btn ${speakerEnabled ? "primary" : ""}`}
                  onClick={() => set("will_have_speaker", true)}
                >
                  Sim
                </button>
                <button
                  type="button"
                  className={`btn ${!speakerEnabled ? "primary" : ""}`}
                  onClick={() => set("will_have_speaker", false)}
                >
                  Não
                </button>
              </div>

              {speakerEnabled ? (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="h2">Cadastro de palestrante (em desenvolvimento)</div>
                  <div className="small" style={{ marginBottom: 10 }}>
                    No futuro, aqui vamos cadastrar o palestrante e vincular nesta imersão.
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => alert("Em desenvolvimento: cadastro de palestrante.")}
                  >
                    Cadastrar palestrante (futuro)
                  </button>
                </div>
              ) : null}
            </Field>
          </>
        ) : null}

        {tab === "narrativa" ? (
          <>
            <div className="h2">Narrativa e dinâmicas</div>

            <Field label="Narrativa da imersão">
              <textarea
                className="input"
                rows={4}
                value={form.immersion_narrative}
                onChange={(e) => set("immersion_narrative", e.target.value)}
              />
            </Field>

            <Field label="Informações para narrativa">
              <textarea
                className="input"
                rows={4}
                value={form.narrative_information}
                onChange={(e) => set("narrative_information", e.target.value)}
              />
            </Field>

            <Field label="Informações para dinâmicas">
              <textarea
                className="input"
                rows={4}
                value={form.dynamics_information}
                onChange={(e) => set("dynamics_information", e.target.value)}
              />
            </Field>
          </>
        ) : null}

        {tab === "trainer" ? (
          <>
            <div className="h2">Trainer principal</div>

            <Field label="Informações sobre o trainer principal">
              <textarea
                className="input"
                rows={4}
                value={form.trainer_main_information}
                onChange={(e) => set("trainer_main_information", e.target.value)}
              />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Nome para vinheta">
                  <input
                    className="input"
                    value={form.vignette_name}
                    onChange={(e) => set("vignette_name", e.target.value)}
                  />
                </Field>
              </div>
              <div className="col">
                <Field label="Perfil Instagram">
                  <input
                    className="input"
                    value={form.instagram_profile}
                    onChange={(e) => set("instagram_profile", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Field label="Texto para vinheta">
              <textarea
                className="input"
                rows={3}
                value={form.vignette_text}
                onChange={(e) => set("vignette_text", e.target.value)}
              />
            </Field>

            <Field label="Contrato (link)">
              <input
                className="input"
                value={form.contract_link}
                onChange={(e) => set("contract_link", e.target.value)}
              />
            </Field>

            <div className="row">
              <div className="col">
                <Field label="Link para fotos">
                  <input
                    className="input"
                    value={form.photos_link}
                    onChange={(e) => set("photos_link", e.target.value)}
                  />
                </Field>
              </div>
              <div className="col">
                <Field label="Link para vídeo de autoridade">
                  <input
                    className="input"
                    value={form.authority_video_link}
                    onChange={(e) => set("authority_video_link", e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <Field label="Resumo profissional">
              <textarea
                className="input"
                rows={4}
                value={form.professional_summary}
                onChange={(e) => set("professional_summary", e.target.value)}
              />
            </Field>

            <Field label="Preferências alimentares / Rider">
              <textarea
                className="input"
                rows={3}
                value={form.food_preferences_rider}
                onChange={(e) => set("food_preferences_rider", e.target.value)}
              />
            </Field>

            <Field label="Observações importantes">
              <textarea
                className="input"
                rows={3}
                value={form.important_observations}
                onChange={(e) => set("important_observations", e.target.value)}
              />
            </Field>

            <Field label="Local de moradia">
              <input
                className="input"
                value={form.place_of_residence}
                onChange={(e) => set("place_of_residence", e.target.value)}
              />
            </Field>
          </>
        ) : null}

        {tab === "terceiros" ? (
          <>
            <div className="h2">Necessidade de terceiros</div>

            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={form.need_third_parties}
                onChange={(e) => set("need_third_parties", e.target.checked)}
              />
              Necessidade de terceiros
            </label>

            <div className="row">
              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.third_party_speech_therapist}
                  onChange={(e) => set("third_party_speech_therapist", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Fonoaudióloga
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.third_party_barber}
                  onChange={(e) => set("third_party_barber", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Barbeiro
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.third_party_hairdresser}
                  onChange={(e) => set("third_party_hairdresser", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Cabeleireiro
              </label>

              <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.third_party_makeup}
                  onChange={(e) => set("third_party_makeup", e.target.checked)}
                  disabled={!form.need_third_parties}
                />
                Maquiagem
              </label>
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Se “Necessidade de terceiros” estiver desmarcado, as opções ficam desabilitadas.
            </div>
          </>
        ) : null}

        <div style={{ height: 12 }} />

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        <div className="row">
          <button className="btn" type="button" onClick={() => router.push("/imersoes")}>
            Cancelar
          </button>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </Layout>
  );
}
