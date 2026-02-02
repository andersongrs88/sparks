import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ImmersionTabs from "../../components/ImmersionTabs";
import { useAuth } from "../../context/AuthContext";
import { createImmersion, listImmersionCatalog } from "../../lib/immersions";
import { listActiveProfiles } from "../../lib/profiles";
import { listTemplates } from "../../lib/templates";
import { listSpeakers } from "../../lib/speakers";
import { isLimitedImmersionRole, normalizeRole } from "../../lib/permissions";

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
  const { loading: authLoading, user, isFullAccess, profile } = useAuth();
  const userProfile = profile;

  const role = normalizeRole(userProfile?.role);
  const showCostsTab = !isLimitedImmersionRole(role);

  const tabs = useMemo(() => {
    const base = [
      { key: "informacoes", label: "Informações" },
      { key: "narrativa", label: "Narrativa" },
      { key: "ferramentas", label: "Ferramentas" },
      { key: "materiais", label: "Materiais" },
      { key: "videos", label: "Vídeos" },
      { key: "checklist", label: "Tarefas" },
    ];
    if (showCostsTab) base.push({ key: "custos", label: "Custos" });
    base.push({ key: "pdca", label: "PDCA" });
    base.push({ key: "trainer", label: "Trainer/Palestrante" });
    return base;
  }, [showCostsTab]);

  const [tab, setTab] = useState("informacoes");

  useEffect(() => {
    if (!router.isReady) return;
    const qtab = String(router.query?.tab || "").toLowerCase();
    if (!qtab) return;
    // Suporta deep-link legado: ?tab=tarefas -> aba Tarefas
    if (qtab === "tarefas") {
      setTab("checklist");
      return;
    }
    const exists = tabs.some((t) => t.key === qtab);
    if (exists) setTab(qtab);
  }, [router.isReady, router.query?.tab, tabs]);

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
  const [speakers, setSpeakers] = useState([]);

  // Cadastro mestre (public.immersion_catalog) — usado para padronizar Nome/Formato.
  const [immersionCatalog, setImmersionCatalog] = useState([]);

  const [form, setForm] = useState({
    immersion_catalog_id: "",
    immersion_name: "",
    // Coluna `type` (Formato) — alguns bancos antigos não possuem `immersion_type`
    type: "",
    start_date: "",
    end_date: "",
    room_location: ROOMS[0],
    status: "Confirmada",
    educational_consultant: "",
    checklist_owner_id: "",
    instructional_designer: "",

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


function normalizeFormatValue(v) {
  return String(v || "").trim().toLowerCase();
}

function catalogFormatToType(format) {
  const f = normalizeFormatValue(format);
  // Backward-compat: sistema antigo usa "Online"; padrão novo usa "Onlive"
  if (f === "presencial") return "Presencial";
  if (f === "onlive") return "Onlive";
  if (f === "online") return "Online";
  if (f === "zoom") return "Zoom";
  if (f === "entrada") return "Entrada";
  if (f === "giants") return "Giants";
  if (f === "incompany") return "Incompany";
  if (f === "outros" || f === "outras") return "Outros";
  if (f === "extras") return "Extras";
  return format ? String(format) : "";
}

function guessChecklistTemplateIdByFormat(_type, templates) {
  const t = String(_type || "").trim().toLowerCase();
  if (!t) return "";
  const list = Array.isArray(templates) ? templates : [];
  const exact = list.find((x) => String(x?.name || "").trim().toLowerCase() === t);
  if (exact?.id) return exact.id;
  const sub = list.find((x) => String(x?.name || "").trim().toLowerCase().includes(t));
  if (sub?.id) return sub.id;

  const aliases = new Map([
    ["onlive", ["onlive", "online"]],
    ["online", ["online", "onlive"]],
    ["presencial", ["presencial", "presenciais"]],
    ["outros", ["outros", "outras"]],
    ["incompany", ["incompany", "in company"]],
  ]);
  for (const [key, vals] of aliases.entries()) {
    if (t !== key) continue;
    for (const v of vals) {
      const m = list.find((x) => String(x?.name || "").trim().toLowerCase().includes(v));
      if (m?.id) return m.id;
    }
  }
  return "";
}

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/login");
  }, [authLoading, user, router]);


useEffect(() => {
  if (authLoading) return;
  if (!user) return;
  (async () => {
    try {
      const catalog = await listImmersionCatalog({ onlyActive: true });
      setImmersionCatalog(catalog || []);
    } catch (e) {
      // Se o catálogo ainda não existir no banco, não bloqueia criação manual (fallback).
      console.warn("immersion_catalog load failed", e);
    }
  })();
}, [authLoading, user]);

  // Ao criar uma nova imersão: se o usuário logado for Consultor, preenche automaticamente.
  useEffect(() => {
    if (authLoading) return;
    if (!userProfile?.id) return;
    const r = normalizeRole(userProfile?.role);
    if (r !== "consultor" && r !== "consultor_educacao") return;
    setForm((prev) => {
      if (prev.educational_consultant) return prev;
      return {
        ...prev,
        educational_consultant: userProfile.id,
        checklist_owner_id: userProfile.id
      };
    });
  }, [authLoading, userProfile]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await listActiveProfiles();
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

    if (immersionCatalog.length > 0 && !form.immersion_catalog_id) {
      setError("Selecione uma imersão cadastrada.");
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
      const created = await createImmersion({
        immersion_name: form.immersion_name.trim(),
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        room_location: form.room_location,
        status: "Confirmada",

        educational_consultant: form.educational_consultant,
        instructional_designer: form.instructional_designer,
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


      // Templates por tipo (materiais, ferramentas, vídeos, cronograma, tarefas) — best-effort
      try {
        await fetch("/api/immersions/apply-type-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            immersion_id: created.id,
            immersion_type: form.type || null,
            start_date: form.start_date,
            end_date: form.end_date,
            include: { tasks: true, schedule: true, materials: true, tools: true, videos: true },
          }),
        });
      } catch (e) {
        console.warn("apply-type-templates failed", e);
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
          <ImmersionTabs tabs={tabs} active={tab} onChange={setTab} />

          {tab !== "informacoes" ? (
            <div className="tabEmpty" role="status" aria-live="polite">
              <div className="small muted" style={{ marginBottom: 10 }}>
                As demais abas ficam disponíveis após criar a imersão. Complete as informações e clique em “Criar imersão”.
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setTab("informacoes")}>Voltar para Informações</button>
              </div>
            </div>
          ) : null}

          {tab === "informacoes" ? (
          <>
          <div className="section">
            <div className="sectionTitle">Informações básicas</div>
            <div className="sectionBody">

{immersionCatalog.length > 0 ? (
  <>
    <Field label="Nome da imersão" hint="Obrigatório">
      <select
        className="input"
        value={form.immersion_catalog_id}
        onChange={(e) => {
          const id = e.target.value;
          const picked = immersionCatalog.find((x) => String(x.id) === String(id));
          const nextName = picked?.name ? String(picked.name) : "";
          const nextType = picked?.format ? catalogFormatToType(picked.format) : "";
          setForm((p) => ({
            ...p,
            immersion_catalog_id: id,
            immersion_name: nextName,
            type: nextType,
            // ao trocar o cadastro, reseta template para permitir auto-seleção pelo formato
            checklist_template_id: "",
          }));
        }}
        required
        aria-label="Selecione uma imersão cadastrada"
      >
        <option value="">Selecione</option>
        {immersionCatalog.map((c) => {
          const fmt = catalogFormatToType(c.format);
          const label = fmt ? `${c.name} • ${fmt}` : c.name;
          return (
            <option key={c.id} value={c.id}>
              {label}
            </option>
          );
        })}
      </select>
    </Field>

    <div className="grid2">
      <Field label="Formato" hint="Obrigatório">
        <input className="input" value={form.type || ""} readOnly aria-readonly="true" />
      </Field>
    </div>
  </>
) : (
  <>
    <Field label="Nome da imersão" hint="Obrigatório">
      <input
        className="input"
        value={form.immersion_name}
        onChange={(e) => setForm((p) => ({ ...p, immersion_name: e.target.value }))}
        placeholder="Ex.: Imersão Gestão MKT Digital"
        required
      />
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
  </>
)}

              <div className="grid2">
                <Field label="Sala">
                  <select className="input" value={form.room_location} onChange={(e) => setForm((p) => ({ ...p, room_location: e.target.value }))}>
                {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>

                <Field label="Status">
                  <input className="input" value="Confirmada" readOnly aria-readonly="true" select/>     
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
                  <select
                    className="input"
                    value={form.educational_consultant}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((p) => ({ ...p, educational_consultant: v, checklist_owner_id: v }));
                    }}
                  >
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
                    onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => ({
                            ...p,
                            trainer_speaker_id: v,
                            // Evita duplicidade: se o trainer estiver na lista de adicionais, remove.
                            speaker_ids: (p.speaker_ids || []).map((sid) => (sid === v ? "" : sid)),
                          }));
                        }}
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
                              // Evita duplicidade entre adicionais e com o Trainer
                              const trainerId = p.trainer_speaker_id;
                              const already = new Set(next.filter(Boolean));
                              if (trainerId) already.add(trainerId);
                              // remove o valor atual do slot para permitir re-seleção do mesmo
                              if (next[idx]) already.delete(next[idx]);
                              if (v && already.has(v)) {
                                next[idx] = "";
                              } else {
                                next[idx] = v;
                              }
                              return { ...p, speaker_ids: next };
                            });
                          }}
                        >
                          <option value="">Selecione</option>
                          {speakers.map((s) => {
                            const selectedElsewhere = new Set((form.speaker_ids || []).filter(Boolean));
                              // Também evita duplicar o Trainer
                              if (form.trainer_speaker_id) selectedElsewhere.add(form.trainer_speaker_id);
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
          </>
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
