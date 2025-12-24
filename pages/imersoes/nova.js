import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";

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

  const [form, setForm] = useState({
    name: "",
    type: "Recorrente",
    format: "Presencial",
    start_date: "",
    end_date: "",
    room: ROOMS[0],
    status: "Planejada",
    education_team: "",
    mentors: "",
    staff_needed: false,
    staff_justification: "",
    os_link: "",
    tech_sheet_link: ""
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    if (!isFullAccess) {
      setError("Apenas administradores podem criar uma nova imersão.");
      return;
    }

    if (!form.name?.trim()) {
      setError("Informe o nome da imersão.");
      return;
    }
    if (!form.start_date || !form.end_date) {
      setError("Informe data inicial e final.");
      return;
    }

    setSaving(true);
    try {
      const created = await createImmersion({
        name: form.name.trim(),
        type: form.type,
        format: form.format,
        start_date: form.start_date,
        end_date: form.end_date,
        room: form.room,
        status: form.status,
        education_team: form.education_team || null,
        mentors: form.mentors || null,
        staff_needed: !!form.staff_needed,
        staff_justification: form.staff_needed ? (form.staff_justification || null) : null,
        os_link: form.os_link || null,
        tech_sheet_link: form.tech_sheet_link || null
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
          Cadastre o básico aqui. Os detalhes completos ficam dentro da imersão na aba <b>Informações</b>.
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}

        <form onSubmit={onSubmit}>
          <Field label="Nome">
            <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex.: Imersão Gestão MKT Digital" required />
          </Field>

          <div className="grid2">
            <Field label="Tipo">
              <select className="input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
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
              <select className="input" value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))}>
                {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>

            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="Planejada">Planejada</option>
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

          <div className="grid2">
            <Field label="Time de educação">
              <input className="input" value={form.education_team} onChange={(e) => setForm((p) => ({ ...p, education_team: e.target.value }))} placeholder="Ex.: Comitê de Educação" />
            </Field>
            <Field label="Mentores">
              <input className="input" value={form.mentors} onChange={(e) => setForm((p) => ({ ...p, mentors: e.target.value }))} placeholder="Ex.: Nome 1, Nome 2" />
            </Field>
          </div>

          <div className="grid2">
            <Field label="Ordem de Serviço (link)">
              <input className="input" value={form.os_link} onChange={(e) => setForm((p) => ({ ...p, os_link: e.target.value }))} placeholder="URL" />
            </Field>
            <Field label="Ficha Técnica (link)">
              <input className="input" value={form.tech_sheet_link} onChange={(e) => setForm((p) => ({ ...p, tech_sheet_link: e.target.value }))} placeholder="URL" />
            </Field>
          </div>

          <Field label="Precisa de staff específico?">
            <div className="row">
              <label className="row" style={{ gap: 8 }}>
                <input type="checkbox" checked={form.staff_needed} onChange={(e) => setForm((p) => ({ ...p, staff_needed: e.target.checked }))} />
                <span className="small">Sim</span>
              </label>
            </div>
          </Field>

          {form.staff_needed ? (
            <Field label="Justificativa do staff">
              <textarea className="input" rows={3} value={form.staff_justification} onChange={(e) => setForm((p) => ({ ...p, staff_justification: e.target.value }))} />
            </Field>
          ) : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>Cancelar</button>
            <button className="btn primary" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar imersão"}</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
