import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";
import { listProfiles } from "../../lib/profiles";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];
const FORMATS = ["Presencial", "Híbrido", "Online"];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="labelRow">
        <label className="label">{label}</label>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function NovaImersaoPage() {
  const router = useRouter();
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [people, setPeople] = useState([]);

  const [form, setForm] = useState({
    immersion_name: "",
    immersion_type: "Recorrente",
    format: "Presencial",
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
    technical_sheet_link: ""
  });

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
    return () => { mounted = false; };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!isFullAccess) {
      setError("Apenas administradores podem criar uma nova imersão.");
      return;
    }

    if (!form.immersion_name?.trim()) {
      setError("Informe o nome da imersão.");
      return;
    }
    if (!form.start_date || !form.end_date) {
      setError("Informe data inicial e final.");
      return;
    }
    if (!form.educational_consultant || !form.instructional_designer) {
      setError("Defina os 2 responsáveis do time de educação: Consultor e Designer.");
      return;
    }

    setSaving(true);
    try {
      const created = await createImmersion({
        immersion_name: form.immersion_name.trim(),
        immersion_type: form.immersion_type,
        format: form.format,
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: form.status,

        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,
        mentors_present: form.mentors_present || null,

        need_specific_staff: !!form.need_specific_staff,
        staff_justification: form.need_specific_staff ? (form.staff_justification || null) : null,
        service_order_link: form.service_order_link || null,
        technical_sheet_link: form.technical_sheet_link || null
      });

      router.push(`/imersoes/${created.id}`);
    } catch (err) {
      setError(err?.message || "Erro ao criar imersão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Nova imersão">
      <div className="card">
        <div className="h2">Criar imersão</div>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Estrutura recomendada: preencha a base + defina os 2 responsáveis do time de educação (Consultor e Designer).
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="section">
            <div className="sectionTitle">Informações básicas</div>
            <div className="sectionBody">
              <Field label="Nome da imersão">
                <input className="input" value={form.immersion_name} onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))} placeholder="Ex.: Imersão Gestão MKT Digital" required />
              </Field>

              <div className="grid2">
                <Field label="Tipo">
                  <select className="input" value={form.immersion_type} onChange={(e) => setForm((p) => ({ ...p, immersion_type: e.target.value }))}>
                <option value="Recorrente">Recorrente</option>
                <option value="Nova">Nova</option>
                  </select>
                </Field>

                <Field label="Formato">
                  <select className="input" value={form.format} onChange={(e) => setForm((p) => ({ ...p, format: e.target.value }))}>
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Sala">
                  <select className="input" value={form.room_location} onChange={(e) => setForm((p) => ({ ...p, room_location: e.target.value }))}>
                {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>

                <Field label="Status">
                  <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="Planejamento">Planejamento</option>
                    <option value="Confirmada">Confirmada</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Data inicial">
                  <input className="input" type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
                </Field>
                <Field label="Data final">
                  <input className="input" type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
                </Field>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Time de educação</div>
            <div className="sectionBody">
              <div className="grid2">
                <Field label="Consultor (Educação)" hint="Obrigatório">
                  <select className="input" value={form.educational_consultant} onChange={(e) => setForm((p) => ({ ...p, educational_consultant: e.target.value }))}>
                    <option value="">Selecione</option>
                    {people.map((p) => <option key={p.id} value={p.name || p.email}>{p.name || p.email}</option>)}
                  </select>
                </Field>
                <Field label="Designer instrucional" hint="Obrigatório">
                  <select className="input" value={form.instructional_designer} onChange={(e) => setForm((p) => ({ ...p, instructional_designer: e.target.value }))}>
                    <option value="">Selecione</option>
                    {people.map((p) => <option key={p.id} value={p.name || p.email}>{p.name || p.email}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Mentores presentes">
                <input className="input" value={form.mentors_present} onChange={(e) => setForm((p) => ({ ...p, mentors_present: e.target.value }))} placeholder="Ex.: Nome 1, Nome 2" />
              </Field>
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Links e documentos</div>
            <div className="sectionBody">
              <div className="grid2">
                <Field label="Ordem de Serviço (link)">
                  <input className="input" value={form.service_order_link} onChange={(e) => setForm((p) => ({ ...p, service_order_link: e.target.value }))} placeholder="URL" />
                </Field>
                <Field label="Ficha Técnica (link)">
                  <input className="input" value={form.technical_sheet_link} onChange={(e) => setForm((p) => ({ ...p, technical_sheet_link: e.target.value }))} placeholder="URL" />
                </Field>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Recursos e staff</div>
            <div className="sectionBody">
              <Field label="Precisa de staff específico?">
                <div className="row">
                  <label className="row" style={{ gap: 8 }}>
                    <input type="checkbox" checked={form.need_specific_staff} onChange={(e) => setForm((p) => ({ ...p, need_specific_staff: e.target.checked }))} />
                    <span className="small">Sim</span>
                  </label>
                </div>
              </Field>

              {form.need_specific_staff ? (
                <Field label="Justificativa do staff">
                  <textarea className="input" rows={3} value={form.staff_justification} onChange={(e) => setForm((p) => ({ ...p, staff_justification: e.target.value }))} />
                </Field>
              ) : null}
            </div>
          </div>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>Cancelar</button>
            <button className="btn primary" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar imersão"}</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
