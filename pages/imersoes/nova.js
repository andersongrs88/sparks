import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { createImmersion } from "../../lib/immersions";

const initial = {
  immersion_name: "",
  start_date: "",
  end_date: "",
  room_location: "",

  education_team_responsible: "",
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

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="h2">{label}</div>
      {children}
    </div>
  );
}

export default function NovaImersao() {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.immersion_name.trim()) return setError("Preencha o nome da imersão.");
    if (!form.start_date) return setError("Preencha a data de início.");

    try {
      setSaving(true);
      await createImmersion({
        ...form,
        immersion_name: form.immersion_name.trim()
      });
      router.push("/imersoes");
    } catch (err) {
      setError(err?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Cadastrar imersão">
      <form className="card" onSubmit={onSubmit}>
        <div className="h2">Identificação</div>

        <Field label="Imersão">
          <input className="input" value={form.immersion_name} onChange={(e) => set("immersion_name", e.target.value)} />
        </Field>

        <Field label="Data de início">
          <input className="input" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>

        <Field label="Sala a ser realizada (ex.: Brasil, São Paulo, PodCast)">
          <input className="input" value={form.room_location} onChange={(e) => set("room_location", e.target.value)} />
        </Field>

        <div style={{ height: 10 }} />

        <div className="h2">Time de Educação</div>

        <Field label="Time de educação responsável pela entrega">
          <input className="input" value={form.education_team_responsible} onChange={(e) => set("education_team_responsible", e.target.value)} />
        </Field>

        <div className="row">
          <div className="col">
            <Field label="Consultor educacional">
              <input className="input" value={form.educational_consultant} onChange={(e) => set("educational_consultant", e.target.value)} />
            </Field>
          </div>
          <div className="col">
            <Field label="Designer instrucional">
              <input className="input" value={form.instructional_designer} onChange={(e) => set("instructional_designer", e.target.value)} />
            </Field>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div className="h2">Links operacionais</div>

        <Field label="Link ordem de serviço">
          <input className="input" value={form.service_order_link} onChange={(e) => set("service_order_link", e.target.value)} />
        </Field>

        <Field label="Link para ficha técnica">
          <input className="input" value={form.technical_sheet_link} onChange={(e) => set("technical_sheet_link", e.target.value)} />
        </Field>

        <div style={{ height: 10 }} />

        <div className="h2">Mentores e staff</div>

        <Field label="Mentores que estarão presentes (campo aberto)">
          <textarea className="input" rows={3} value={form.mentors_present} onChange={(e) => set("mentors_present", e.target.value)} />
        </Field>

        <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <input type="checkbox" checked={form.need_specific_staff} onChange={(e) => set("need_specific_staff", e.target.checked)} />
          Existe necessidade de staff específico para essa imersão?
        </label>

        <Field label="Justificativa">
          <textarea className="input" rows={2} value={form.staff_justification} onChange={(e) => set("staff_justification", e.target.value)} />
        </Field>

        <div style={{ height: 10 }} />

        <div className="h2">Narrativa e dinâmicas</div>

        <Field label="Narrativa da imersão">
          <textarea className="input" rows={3} value={form.immersion_narrative} onChange={(e) => set("immersion_narrative", e.target.value)} />
        </Field>

        <Field label="Informações para narrativa">
          <textarea className="input" rows={3} value={form.narrative_information} onChange={(e) => set("narrative_information", e.target.value)} />
        </Field>

        <Field label="Informações para dinâmicas">
          <textarea className="input" rows={3} value={form.dynamics_information} onChange={(e) => set("dynamics_information", e.target.value)} />
        </Field>

        <div style={{ height: 10 }} />

        <div className="h2">Trainer principal</div>

        <Field label="Informações sobre o trainer principal">
          <textarea className="input" rows={3} value={form.trainer_main_information} onChange={(e) => set("trainer_main_information", e.target.value)} />
        </Field>

        <div className="row">
          <div className="col">
            <Field label="Nome para vinheta">
              <input className="input" value={form.vignette_name} onChange={(e) => set("vignette_name", e.target.value)} />
            </Field>
          </div>
          <div className="col">
            <Field label="Perfil Instagram">
              <input className="input" value={form.instagram_profile} onChange={(e) => set("instagram_profile", e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="Texto para vinheta">
          <textarea className="input" rows={2} value={form.vignette_text} onChange={(e) => set("vignette_text", e.target.value)} />
        </Field>

        <Field label="Contrato (link)">
          <input className="input" value={form.contract_link} onChange={(e) => set("contract_link", e.target.value)} />
        </Field>

        <Field label="Link para fotos">
          <input className="input" value={form.photos_link} onChange={(e) => set("photos_link", e.target.value)} />
        </Field>

        <Field label="Link para vídeo de autoridade">
          <input className="input" value={form.authority_video_link} onChange={(e) => set("authority_video_link", e.target.value)} />
        </Field>

        <Field label="Resumo profissional">
          <textarea className="input" rows={3} value={form.professional_summary} onChange={(e) => set("professional_summary", e.target.value)} />
        </Field>

        <Field label="Preferências alimentares / Rider">
          <textarea className="input" rows={2} value={form.food_preferences_rider} onChange={(e) => set("food_preferences_rider", e.target.value)} />
        </Field>

        <Field label="Observações importantes">
          <textarea className="input" rows={2} value={form.important_observations} onChange={(e) => set("important_observations", e.target.value)} />
        </Field>

        <Field label="Local de moradia">
          <input className="input" value={form.place_of_residence} onChange={(e) => set("place_of_residence", e.target.value)} />
        </Field>

        <div style={{ height: 10 }} />

        <div className="h2">Necessidade de terceiros</div>

        <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <input type="checkbox" checked={form.need_third_parties} onChange={(e) => set("need_third_parties", e.target.checked)} />
          Necessidade de terceiros
        </label>

        <div className="row">
          <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={form.third_party_speech_therapist} onChange={(e) => set("third_party_speech_therapist", e.target.checked)} />
            Fonoaudióloga
          </label>

          <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={form.third_party_barber} onChange={(e) => set("third_party_barber", e.target.checked)} />
            Barbeiro
          </label>

          <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={form.third_party_hairdresser} onChange={(e) => set("third_party_hairdresser", e.target.checked)} />
            Cabeleireiro
          </label>

          <label className="small col" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={form.third_party_makeup} onChange={(e) => set("third_party_makeup", e.target.checked)} />
            Maquiagem
          </label>
        </div>

        <div style={{ height: 10 }} />

        <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <input type="checkbox" checked={form.will_have_speaker} onChange={(e) => set("will_have_speaker", e.target.checked)} />
          Vai ter palestrante?
        </label>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</div> : null}

        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar cadastro"}
        </button>
      </form>
    </Layout>
  );
}
