import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];

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
    immersion_name: "",
    immersion_type: "Recorrente",
    start_date: "",
    end_date: "",
    room: ROOMS[0],
    status: "Planejada"
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

    if (!form.immersion_name?.trim()) {
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
        name: form.immersion_name.trim(),
        type: form.immersion_type,
        start_date: form.start_date,
        end_date: form.end_date,
        room: form.room,
        status: form.status
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
        <div className="small" style={{ marginBottom: 12, color: "var(--muted)" }}>
          Esta versão não utiliza templates de checklist. Após criar a imersão, adicione tarefas em <b>Checklist</b>.
        </div>

        {error ? <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div> : null}

        <form onSubmit={onSubmit}>
          <Field label="Nome">
            <input
              className="input"
              value={form.immersion_name}
              onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))}
              placeholder="Ex.: Imersão Gestão MKT Digital"
              required
            />
          </Field>

          <div className="row">
            <div className="col">
              <Field label="Tipo">
                <select className="input" value={form.immersion_type} onChange={(e) => setForm((p) => ({ ...p, immersion_type: e.target.value }))}>
                  <option value="Recorrente">Recorrente</option>
                  <option value="Nova">Nova</option>
                </select>
              </Field>
            </div>

            <div className="col">
              <Field label="Sala">
                <select className="input" value={form.room} onChange={(e) => setForm((p) => ({ ...p, room: e.target.value }))}>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="row">
            <div className="col">
              <Field label="Data inicial">
                <input className="input" type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </Field>
            </div>
            <div className="col">
              <Field label="Data final">
                <input className="input" type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
              </Field>
            </div>
          </div>

          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              <option value="Planejada">Planejada</option>
              <option value="Confirmada">Confirmada</option>
              <option value="Em andamento">Em andamento</option>
              <option value="Concluída">Concluída</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </Field>

          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn" type="button" onClick={() => router.push("/imersoes")}>Cancelar</button>
            <button className="btn primary" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar imersão"}</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
