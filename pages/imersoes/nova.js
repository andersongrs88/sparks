import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";
import { listProfiles } from "../../lib/profiles";
import { supabase } from "../../lib/supabaseClient";
import { listTemplates } from "../../lib/templates";
import { listSpeakers } from "../../lib/speakers";
import { normalizeRole } from "../../lib/permissions";

const ROOMS = ["Brasil", "São Paulo", "PodCast"];

// Formato (domínio fechado) conforme definido por você. (Mesma nomenclatura da tela de visualização.)
const IMMERSION_FORMATS = ["Presencial", "Online", "Zoom", "Entrada", "Extras", "Giants", "Outras"];

function Field({ label, children, hint }) {
  const isReq = typeof hint === "string" && hint.toLowerCase().includes("obrigat");
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="labelRow">
        <label className="label">{label}</label>
        {hint ? (
          <span className={`hint ${isReq ? "hintReq" : ""}`}>{isReq ? "(obrigatório)" : hint}</span>
        ) : null}
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
  const errorRef = useRef(null);

  useEffect(() => {
    if (error && errorRef.current) {
      try { errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      try { errorRef.current.focus({ preventScroll: true }); } catch {}
    }
  }, [error]);
  const [people, setPeople] = useState([]);
  const [peopleByRole, setPeopleByRole] = useState({
    consultores: [],
    designers: [],
    producao: [],
    eventos: []
  });
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  const [immersionOptions, setImmersionOptions] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  const [form, setForm] = useState({
    immersion_name: "",
    // Coluna `type` (Formato) — alguns bancos antigos não possuem `immersion_type`
    type: "",
    start_date: "",
    end_date: "",
    room_location: ROOMS[0],
    status: "Planejamento",
    educational_consultant: "",
    instructional_designer: "",
    production_responsible: "",
    events_responsible: "",

    // Palestrantes
    trainer_speaker_id: "",
    speaker_ids: [""],
    checklist_template_id: "",
    mentors_present: "",
    need_specific_staff: false,
    staff_justification: "",
    service_order_link: "",
    technical_sheet_link: ""
  });

  // Clonar imersão inteira (substitui o bloco "Templates do tipo")
  const [cloneSourceId, setCloneSourceId] = useState("");

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
        if (mounted) {
          setPeople(active);

          const by = { consultores: [], designers: [], producao: [], eventos: [] };
          for (const p of active) {
            const r = normalizeRole(p?.role);
            if (r === "consultor") by.consultores.push(p);
            if (r === "consultor_educacao") by.consultores.push(p);
            if (r === "designer") by.designers.push(p);
            if (r === "producao") by.producao.push(p);
            if (r === "eventos") by.eventos.push(p);
          }

          // Ordena para UX
          for (const k of Object.keys(by)) {
            by[k].sort((a, b) => String(a?.name || a?.email || "").localeCompare(String(b?.name || b?.email || "")));
          }

          setPeopleByRole(by);
        }
      } catch {
        // silencioso: o cadastro ainda funciona sem a lista de pessoas
      }

      try {
        const sp = await listSpeakers();
        if (mounted) setSpeakers(sp || []);
      } catch {
        // opcional
      }

      try {
        const tpl = await listTemplates();
        const active = (tpl || []).filter((t) => t.is_active !== false);
        if (mounted) setChecklistTemplates(active);
      } catch {
        // silencioso
      }

      // Opções para clonagem
      try {
        const { data, error: e } = await supabase
          .from("immersions")
          .select("id, immersion_name, start_date")
          .order("start_date", { ascending: false })
          .limit(300);
        if (!e && mounted) {
          setImmersionOptions((data || []).map((r) => ({ id: r.id, name: r.immersion_name, start_date: r.start_date })));
        }
      } catch {
        // best-effort
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
      setError("Defina os responsáveis do time de educação: Consultor e Designer.");
      return;
    }

    // Produção é opcional (conforme regra atual do produto)

    if (!form.checklist_template_id) {
      setError("Selecione um Checklist template (obrigatório).");
      return;
    }

    setSaving(true);
    try {
      // Clonar imersão inteira (copia tarefas, cronograma, materiais, ferramentas, vídeos, PDCA e custos)
      if (cloneSourceId) {
        const r = await fetch("/api/immersions/clone-full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_id: cloneSourceId,
            overrides: {
              immersion_name: form.immersion_name.trim(),
              type: form.type,
              start_date: form.start_date,
              end_date: form.end_date,
              room_location: form.room_location,
              status: form.status,
              educational_consultant: form.educational_consultant,
              instructional_designer: form.instructional_designer,
              production_responsible: form.production_responsible || null,
              events_responsible: form.events_responsible || null,
              trainer_speaker_id: form.trainer_speaker_id || null,
              speaker_ids: Array.from(new Set((form.speaker_ids || []).filter(Boolean))),
              checklist_template_id: form.checklist_template_id,
              mentors_present: form.mentors_present || null,
              need_specific_staff: !!form.need_specific_staff,
              staff_justification: form.need_specific_staff ? (form.staff_justification || null) : null,
              service_order_link: form.service_order_link || null,
              technical_sheet_link: form.technical_sheet_link || null,
            }
          })
        });
        if (!r.ok) {
          const msg = await r.text();
          throw new Error(msg || "Falha ao clonar imersão.");
        }
        const out = await r.json();
        router.push(`/imersoes/${out?.id}`);
        return;
      }

      const created = await createImmersion({
        immersion_name: form.immersion_name.trim(),
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: form.status,

        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,
        production_responsible: form.production_responsible || null,
        events_responsible: form.events_responsible || null,
        trainer_speaker_id: form.trainer_speaker_id || null,
        speaker_ids: Array.from(new Set((form.speaker_ids || []).filter(Boolean))),
        checklist_template_id: form.checklist_template_id,
        mentors_present: form.mentors_present || null,

        need_specific_staff: !!form.need_specific_staff,
        staff_justification: form.need_specific_staff ? (form.staff_justification || null) : null,
        service_order_link: form.service_order_link || null,
        technical_sheet_link: form.technical_sheet_link || null
      });

      // Checklist template (gera tarefas baseadas no checklist_template_items) — best-effort
      if (form.checklist_template_id) {
        try {
          await fetch("/api/immersions/apply-checklist-template", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              immersion_id: created.id,
              template_id: form.checklist_template_id,
            }),
          });
        } catch (e) {
          console.warn("apply-checklist-template failed", e);
        }
      }

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

        {error ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            className="small"
            style={{ color: "var(--danger)", marginBottom: 10 }}
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit}>
          <div className="section">
            <div className="sectionTitle">Informações básicas</div>
            <div className="sectionBody">
              <Field label="Nome da imersão" hint="Obrigatório">
                <input className="input" value={form.immersion_name} onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))} placeholder="Ex.: Imersão Gestão MKT Digital" required />
              </Field>

              <div className="grid2">
                <Field label="Formato" hint="Obrigatório">
                  <select className="input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option value="">Selecione</option>
                    {IMMERSION_FORMATS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="card" style={{ padding: 12, marginTop: 8, background: "var(--bg2)", border: "1px solid var(--border)" }}>
                <div className="small" style={{ fontWeight: 800, marginBottom: 6 }}>Clonar imersão (opcional)</div>
                <div className="small muted" style={{ marginBottom: 10 }}>
                  Se você escolher uma imersão base, o sistema copia a estrutura completa (tarefas, cronograma, materiais, ferramentas, vídeos, PDCA e custos) e ajusta os prazos pela nova data inicial.
                </div>
                <select className="input" value={cloneSourceId} onChange={(e) => setCloneSourceId(e.target.value)}>
                  <option value="">Não clonar</option>
                  {immersionOptions.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}{it.start_date ? ` — ${it.start_date}` : ""}</option>
                  ))}
                </select>
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
                <Field label="Consultor" hint="Obrigatório">
                  <select className="input" value={form.educational_consultant} onChange={(e) => setForm((p) => ({ ...p, educational_consultant: e.target.value }))}>
                    <option value="">Selecione</option>
                    {(peopleByRole.consultores || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Designer" hint="Obrigatório">
                  <select className="input" value={form.instructional_designer} onChange={(e) => setForm((p) => ({ ...p, instructional_designer: e.target.value }))}>
                    <option value="">Selecione</option>
                    {(peopleByRole.designers || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid2">
                <Field label="Produção">
                  <select className="input" value={form.production_responsible} onChange={(e) => setForm((p) => ({ ...p, production_responsible: e.target.value }))}>
                    <option value="">—</option>
                    {(peopleByRole.producao || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Eventos">
                  <select className="input" value={form.events_responsible} onChange={(e) => setForm((p) => ({ ...p, events_responsible: e.target.value }))}>
                    <option value="">—</option>
                    {(peopleByRole.eventos || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Checklist template" hint="Obrigatório">
                <select
                  className="input"
                  value={form.checklist_template_id}
                  onChange={(e) => setForm((p) => ({ ...p, checklist_template_id: e.target.value }))}
                  required
                >
                  <option value="">Selecione</option>
                  {checklistTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Mentores presentes">
                <input className="input" value={form.mentors_present} onChange={(e) => setForm((p) => ({ ...p, mentors_present: e.target.value }))} placeholder="Ex.: Nome 1, Nome 2" />
              </Field>
            </div>
          </div>

          <div className="section">
            <div className="sectionTitle">Palestrantes</div>
            <div className="sectionBody">
              <div className="grid2">
                <Field label="Nome do Trainer" hint="Opcional">
                  <select
                    className="input"
                    value={form.trainer_speaker_id}
                    onChange={(e) => setForm((p) => ({ ...p, trainer_speaker_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {speakers.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Vai ter palestrante?" hint="Opcional">
                  <div className="stack" style={{ gap: 10 }}>
                    {(form.speaker_ids || []).map((sid, idx) => (
                      <div key={idx} className="row" style={{ gap: 10 }}>
                        <select
                          className="input"
                          value={sid}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((p) => {
                              const next = [...(p.speaker_ids || [])];
                              next[idx] = v;
                              return { ...p, speaker_ids: next };
                            });
                          }}
                        >
                          <option value="">Selecione</option>
                          {speakers.map((s) => {
                            const selectedElsewhere = new Set((form.speaker_ids || []).filter(Boolean));
                            // Permite manter o próprio valor selecionado; bloqueia duplicidade em outros slots
                            if (sid) selectedElsewhere.delete(sid);
                            const isDup = selectedElsewhere.has(s.id);
                            return (
                              <option key={s.id} value={s.id} disabled={isDup}>
                                {s.full_name || s.email}{isDup ? " (já selecionado)" : ""}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setForm((p) => {
                              const next = [...(p.speaker_ids || [])];
                              next.splice(idx, 1);
                              return { ...p, speaker_ids: next.length ? next : [""] };
                            });
                          }}
                          disabled={(form.speaker_ids || []).length === 1}
                        >
                          Remover
                        </button>
                      </div>
                    ))}

                    <div className="row" style={{ gap: 10 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setForm((p) => ({ ...p, speaker_ids: [...(p.speaker_ids || []), ""] }))}
                      >
                        + Adicionar palestrante
                      </button>
                      <div className="small muted">Você pode vincular múltiplos palestrantes nesta imersão.</div>
                    </div>
                  </div>
                </Field>
              </div>
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
