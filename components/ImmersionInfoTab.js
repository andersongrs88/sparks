import React from "react";
import { IMMERSION_FORMATS, IMMERSION_STATUSES, ROOMS, normalizeImmersionStatus } from "../lib/immersionConstants";

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <div className="fieldLabel">
        <span>{label}</span>
        {hint ? <span className="fieldHint">{hint}</span> : null}
      </div>
      <div className="fieldBody">{children}</div>
    </label>
  );
}

export default function ImmersionInfoTab({
  form,
  setForm,
  profiles = [],
  speakers = [],
  isCreate = false,
  disableNonInfoFields = false,
  onCreateAndGoToTab,
}) {
  const canEdit = !disableNonInfoFields;

  const safeStatus = normalizeImmersionStatus(form.status);

  return (
    <>
      <div className="section">
        <div className="sectionTitle">Informações básicas</div>
        <div className="sectionBody">
          <Field label="Nome da imersão" hint="Obrigatório">
            <input
              className="input"
              value={form.immersion_name || ""}
              onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))}
              placeholder="Ex.: Imersão Gestão MKT Digital"
              required
              disabled={!canEdit && !isCreate}
            />
          </Field>

          <div className="grid2">
            <Field label="Formato" hint="Obrigatório">
              <select
                className="input"
                value={form.type || ""}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="">Selecione</option>
                {IMMERSION_FORMATS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Local">
              <select
                className="input"
                value={form.room_location || ROOMS[0]}
                onChange={(e) => setForm((p) => ({ ...p, room_location: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                {ROOMS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid2">
            <Field label="Data início">
              <input
                className="input"
                type="date"
                value={form.start_date || ""}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                disabled={!canEdit && !isCreate}
              />
            </Field>

            <Field label="Data fim">
              <input
                className="input"
                type="date"
                value={form.end_date || ""}
                onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                disabled={!canEdit && !isCreate}
              />
            </Field>
          </div>

          <Field label="Status">
            <select
              className="input"
              value={safeStatus || "Planejamento"}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              disabled={!canEdit && !isCreate}
            >
              {IMMERSION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="section">
        <div className="sectionTitle">Time de educação</div>
        <div className="sectionBody">
          <div className="grid2">
            <Field label="Consultor" hint="Dono das tarefas">
              <select
                className="input"
                value={form.educational_consultant || ""}
                onChange={(e) => setForm((p) => ({ ...p, educational_consultant: e.target.value, checklist_owner_id: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="">Selecione</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Designer Instrucional">
              <select
                className="input"
                value={form.instructional_designer || ""}
                onChange={(e) => setForm((p) => ({ ...p, instructional_designer: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="">Selecione</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid2">
            <Field label="Produção (opcional)">
              <select
                className="input"
                value={form.production_responsible || ""}
                onChange={(e) => setForm((p) => ({ ...p, production_responsible: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="">(sem responsável)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Eventos (opcional)">
              <select
                className="input"
                value={form.events_responsible || ""}
                onChange={(e) => setForm((p) => ({ ...p, events_responsible: e.target.value }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="">(sem responsável)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.name || p.email || p.id}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="sectionTitle">Palestrantes</div>
        <div className="sectionBody">
          <Field label="Trainer principal">
            <select
              className="input"
              value={form.trainer_speaker_id || ""}
              onChange={(e) => setForm((p) => ({ ...p, trainer_speaker_id: e.target.value }))}
              disabled={!canEdit && !isCreate}
            >
              <option value="">Selecione</option>
              {speakers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.full_name || s.instagram_profile || s.id}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Palestrantes adicionais">
            <div className="stack">
              {(Array.isArray(form.speaker_ids) ? form.speaker_ids : [""]).map((id, idx) => (
                <div key={idx} className="row">
                  <select
                    className="input"
                    value={id || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((p) => {
                        const next = Array.isArray(p.speaker_ids) ? [...p.speaker_ids] : [];
                        next[idx] = v;
                        return { ...p, speaker_ids: next };
                      });
                    }}
                    disabled={!canEdit && !isCreate}
                  >
                    <option value="">Selecione</option>
                    {speakers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.full_name || s.instagram_profile || s.id}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setForm((p) => {
                        const next = Array.isArray(p.speaker_ids) ? [...p.speaker_ids] : [];
                        next.splice(idx, 1);
                        return { ...p, speaker_ids: next.length ? next : [""] };
                      });
                    }}
                    disabled={!canEdit && !isCreate || (Array.isArray(form.speaker_ids) ? form.speaker_ids.length <= 1 : true)}
                  >
                    Remover
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn"
                onClick={() => setForm((p) => ({ ...p, speaker_ids: [...(Array.isArray(p.speaker_ids) ? p.speaker_ids : []), ""] }))}
                disabled={!canEdit && !isCreate}
              >
                Adicionar palestrante
              </button>
            </div>
          </Field>
        </div>
      </div>

      <div className="section">
        <div className="sectionTitle">Links e documentos</div>
        <div className="sectionBody">
          <div className="grid2">
            <Field label="Link OS">
              <input
                className="input"
                value={form.service_order_link || ""}
                onChange={(e) => setForm((p) => ({ ...p, service_order_link: e.target.value }))}
                placeholder="https://"
                disabled={!canEdit && !isCreate}
              />
            </Field>

            <Field label="Ficha técnica">
              <input
                className="input"
                value={form.technical_sheet_link || ""}
                onChange={(e) => setForm((p) => ({ ...p, technical_sheet_link: e.target.value }))}
                placeholder="https://"
                disabled={!canEdit && !isCreate}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="sectionTitle">Recursos e staff</div>
        <div className="sectionBody">
          <div className="grid2">
            <Field label="Mentores presentes">
              <input
                className="input"
                value={form.mentors_present || ""}
                onChange={(e) => setForm((p) => ({ ...p, mentors_present: e.target.value }))}
                disabled={!canEdit && !isCreate}
              />
            </Field>

            <Field label="Precisa de staff específico?">
              <select
                className="input"
                value={form.need_specific_staff ? "sim" : "nao"}
                onChange={(e) => setForm((p) => ({ ...p, need_specific_staff: e.target.value === "sim" }))}
                disabled={!canEdit && !isCreate}
              >
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </Field>
          </div>

          {form.need_specific_staff ? (
            <Field label="Justificativa de staff" hint="Obrigatório quando 'Sim'">
              <textarea
                className="input"
                rows={4}
                value={form.staff_justification || ""}
                onChange={(e) => setForm((p) => ({ ...p, staff_justification: e.target.value }))}
                disabled={!canEdit && !isCreate}
              />
            </Field>
          ) : null}

          {isCreate && typeof onCreateAndGoToTab === "function" ? (
            <div className="hintBox" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Dica</div>
              <div style={{ marginBottom: 10 }}>
                As demais abas ficam disponíveis após criar a imersão.
              </div>
              <button type="button" className="btn" onClick={onCreateAndGoToTab}>
                Criar imersão
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
