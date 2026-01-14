import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import ImmersionTabs from "../../components/ImmersionTabs";
import ImmersionInfoTab from "../../components/ImmersionInfoTab";
import { ROOMS } from "../../lib/immersionConstants";
import { useAuth } from "../../context/AuthContext";
import { createImmersion } from "../../lib/immersions";
import { listActiveProfiles } from "../../lib/profiles";
import { supabase } from "../../lib/supabaseClient";
import { listTemplates } from "../../lib/templates";
import { listSpeakers } from "../../lib/speakers";
import { isLimitedImmersionRole, normalizeRole } from "../../lib/permissions";

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
    checklist_owner_id: "",
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
          <ImmersionInfoTab
            form={form}
            setForm={setForm}
            profiles={people}
            speakers={speakers}
            isCreate={true}
            disableNonInfoFields={false}
          />
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
