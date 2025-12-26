import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { listSpeakers, updateSpeaker, deleteSpeaker } from "../../lib/speakers";
import { getSpeakerRider, saveSpeakerRider } from "../../lib/speakerRider";

export default function PalestranteDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { loading: authLoading, user, isFullAccess } = useAuth();

  const [tab, setTab] = useState("dados");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [speaker, setSpeaker] = useState(null);
  const [form, setForm] = useState({ full_name: "", email: "", is_internal: true, vignette_name: "" });
  const emptyRider = useMemo(
    () => ({
      // INFORMAÇÕES GERAIS
      education_contact: "",
      event_role: "trainer", // trainer | palestrante | painel
      first_time_ga: null, // true/false/null
      relationship_ga: "nenhum", // amigo | membro_giants | nenhum
      presentation_date: "", // YYYY-MM-DD
      presentation_time: "", // HH:MM
      stay_duration: "",
      photo_available: null,

      // INFORMAÇÕES PESSOAIS
      gender: "outro", // mulher | homem | outro
      city: "",
      professional_summary: "",

      // EQUIPE
      has_assessor: null,
      assessor_info: "",
      has_companions: null,
      companions_info: "",
      has_security: null,
      security_info: "",

      // TRANSPORTE
      transport_type: "carro_proprio",
      vehicle_model: "",
      vehicle_plate: "",

      // ALIMENTAÇÃO
      breakfast: null,
      breakfast_notes: "",
      lunch: null,
      lunch_notes: "",
      afternoon_snack: null,
      snack_from_event: null,
      snack_notes: "",
      dinner: null,
      dinner_notes: "",
      dietary_restrictions: "",
      preferred_drinks: "",
      dressing_room_food_kit: null,
      food_additional_info: "",

      // CAMARIM
      private_room: null,

      // PALESTRA
      lecture_topic: "",
      needs_ppt: null,
      microphone_type: "headset",
      stage_water: "natural",
      stage_other_drink: "",

      // PRESENTE
      will_receive_gift: null,
      gift_option: "",
      alcohol_consumption: null,
      wine_preference: "",
      sugar_consumption: null,
      chocolate_consumption: null,
      gift_notes: "",

      // OBSERVAÇÕES
      additional_notes: "",
    }),
    []
  );

  const [rider, setRider] = useState(emptyRider);
  const [riderLoaded, setRiderLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && user && !isFullAccess) router.replace("/dashboard");
  }, [authLoading, user, isFullAccess, router]);

  async function loadSpeaker() {
    const sid = String(id || "").trim();
    if (!sid) return;
    setBusy(true);
    setError("");
    try {
      const list = await listSpeakers();
      const found = (list || []).find((s) => s.id === sid) || null;
      if (!found) {
        setError("Palestrante não encontrado.");
        setSpeaker(null);
        return;
      }
      setSpeaker(found);
      setForm({
        full_name: found.full_name || "",
        email: found.email || "",
        is_internal: found.is_internal !== false,
        vignette_name: found.vignette_name || "",
      });
    } catch (e) {
      setError(e?.message || "Falha ao carregar palestrante.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadSpeaker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadRiderIfNeeded() {
    const sid = String(id || "").trim();
    if (!sid || riderLoaded) return;
    setError("");
    try {
      const data = await getSpeakerRider(sid);
      const raw = data?.rider && typeof data.rider === "object" ? data.rider : {};
      setRider({ ...emptyRider, ...raw });
      setRiderLoaded(true);
    } catch (e) {
      setError(e?.message || "Falha ao carregar Rider.");
    }
  }

  useEffect(() => {
    if (tab === "rider") loadRiderIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const title = useMemo(() => speaker?.full_name ? `Palestrante • ${speaker.full_name}` : "Palestrante", [speaker]);

  async function onSaveSpeaker() {
    const sid = String(id || "").trim();
    if (!sid) return;
    setBusy(true);
    setError("");
    try {
      await updateSpeaker(sid, {
        full_name: form.full_name,
        email: form.email || null,
        is_internal: !!form.is_internal,
        vignette_name: form.vignette_name || null,
      });
      await loadSpeaker();
    } catch (e) {
      setError(e?.message || "Falha ao salvar palestrante.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveRider() {
    const sid = String(id || "").trim();
    if (!sid) return;
    setBusy(true);
    setError("");
    try {
      await saveSpeakerRider(sid, rider);
      setRiderLoaded(false);
      await loadRiderIfNeeded();
    } catch (e) {
      setError(e?.message || "Falha ao salvar Rider.");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSpeaker() {
    const sid = String(id || "").trim();
    if (!sid) return;
    if (!confirm("Excluir este palestrante?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteSpeaker(sid);
      router.push("/palestrantes");
    } catch (e) {
      setError(e?.message || "Falha ao excluir palestrante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title={title}>
      <div className="pageHeader">
        <div>
          <div className="h1">{speaker?.full_name || "Palestrante"}</div>
          <div className="small muted">Gerencie dados do palestrante e Rider do evento.</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => router.push("/palestrantes")} disabled={busy}>
            Voltar
          </button>
          <button className="btn danger" type="button" onClick={onDeleteSpeaker} disabled={busy}>
            Excluir
          </button>
        </div>
      </div>

      {error ? <div className="alert danger">{error}</div> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button className={`btn ${tab === "dados" ? "primary" : ""}`} type="button" onClick={() => setTab("dados")}>
          Dados
        </button>
        <button className={`btn ${tab === "rider" ? "primary" : ""}`} type="button" onClick={() => setTab("rider")}>
          Rider
        </button>
      </div>

      {tab === "dados" ? (
        <div className="card">
          <div className="h2">Dados do palestrante</div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="field">
              <div className="label">Nome completo <span className="req">(obrigatório)</span></div>
              <input className="input" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
            </div>
            <div className="field">
              <div className="label">E-mail</div>
              <input className="input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="field">
              <div className="label">Interno ou Externo</div>
              <select className="input" value={form.is_internal ? "interno" : "externo"} onChange={(e) => setForm((p) => ({ ...p, is_internal: e.target.value === "interno" }))}>
                <option value="interno">Interno</option>
                <option value="externo">Externo</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Nome para vinheta</div>
              <input className="input" value={form.vignette_name} onChange={(e) => setForm((p) => ({ ...p, vignette_name: e.target.value }))} placeholder="Ex.: Prof. João Silva" />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={onSaveSpeaker} disabled={busy}>
              Salvar
            </button>
          </div>
        </div>
      ) : null}

      {tab === "rider" ? (
        <div className="card">
          <div className="h2">Rider do evento</div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Preencha as informações operacionais do palestrante/trainer. Este Rider fica atrelado ao palestrante e pode ser reutilizado em novas imersões.
          </div>

          {/* Helpers simples */}
          <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Informações gerais</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Responsável em educação pelo contato/logística</div>
                  <input className="input" value={rider.education_contact} onChange={(e) => setRider((p) => ({ ...p, education_contact: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">Função no evento</div>
                  <select className="input" value={rider.event_role} onChange={(e) => setRider((p) => ({ ...p, event_role: e.target.value }))}>
                    <option value="trainer">TRAINER</option>
                    <option value="palestrante">PALESTRANTE</option>
                    <option value="painel">PARTICIPANTE DE PAINEL</option>
                  </select>
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Primeira vez num evento/imersão do GA?</div>
                  <select className="input" value={rider.first_time_ga === null ? "" : rider.first_time_ga ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, first_time_ga: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Relação com Marcus e Aline</div>
                  <select className="input" value={rider.relationship_ga} onChange={(e) => setRider((p) => ({ ...p, relationship_ga: e.target.value }))}>
                    <option value="nenhum">Nenhum</option>
                    <option value="amigo">Amigo(a) pessoal</option>
                    <option value="membro_giants">Membro Giants</option>
                  </select>
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Data da palestra</div>
                  <input className="input" type="date" value={rider.presentation_date} onChange={(e) => setRider((p) => ({ ...p, presentation_date: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">Horário da palestra</div>
                  <input className="input" type="time" value={rider.presentation_time} onChange={(e) => setRider((p) => ({ ...p, presentation_time: e.target.value }))} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Tempo de permanência no evento</div>
                  <input className="input" value={rider.stay_duration} onChange={(e) => setRider((p) => ({ ...p, stay_duration: e.target.value }))} placeholder="Ex.: 2h, manhã toda, dia inteiro" />
                </div>
                <div className="field">
                  <div className="label">Disponibilidade para fotos</div>
                  <select className="input" value={rider.photo_available === null ? "" : rider.photo_available ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, photo_available: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Informações pessoais</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Gênero</div>
                  <select className="input" value={rider.gender} onChange={(e) => setRider((p) => ({ ...p, gender: e.target.value }))}>
                    <option value="mulher">Mulher</option>
                    <option value="homem">Homem</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Cidade de residência</div>
                  <input className="input" value={rider.city} onChange={(e) => setRider((p) => ({ ...p, city: e.target.value }))} />
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <div className="label">Resumo profissional</div>
                <textarea className="input" rows={4} value={rider.professional_summary} onChange={(e) => setRider((p) => ({ ...p, professional_summary: e.target.value }))} />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Equipe</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Assessor</div>
                  <select className="input" value={rider.has_assessor === null ? "" : rider.has_assessor ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, has_assessor: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Nome/Documento (assessor)</div>
                  <input className="input" value={rider.assessor_info} onChange={(e) => setRider((p) => ({ ...p, assessor_info: e.target.value }))} disabled={!rider.has_assessor} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Acompanhantes</div>
                  <select className="input" value={rider.has_companions === null ? "" : rider.has_companions ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, has_companions: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Nome/Documento (acompanhantes)</div>
                  <input className="input" value={rider.companions_info} onChange={(e) => setRider((p) => ({ ...p, companions_info: e.target.value }))} disabled={!rider.has_companions} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Segurança</div>
                  <select className="input" value={rider.has_security === null ? "" : rider.has_security ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, has_security: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Nome/Documento (segurança)</div>
                  <input className="input" value={rider.security_info} onChange={(e) => setRider((p) => ({ ...p, security_info: e.target.value }))} disabled={!rider.has_security} />
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Transporte</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Locomoção para o evento</div>
                  <select className="input" value={rider.transport_type} onChange={(e) => setRider((p) => ({ ...p, transport_type: e.target.value }))}>
                    <option value="carro_proprio">Carro próprio</option>
                    <option value="motorista_ga">Carro com nosso motorista</option>
                    <option value="helicoptero_ga">Nosso helicóptero</option>
                    <option value="helicoptero_proprio">Helicóptero próprio</option>
                    <option value="rbi">RBI</option>
                    <option value="aviao_ga">Avião com custo nosso</option>
                    <option value="aviao_palestrante">Avião com custo do palestrante</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Modelo do veículo</div>
                  <input className="input" value={rider.vehicle_model} onChange={(e) => setRider((p) => ({ ...p, vehicle_model: e.target.value }))} placeholder="Modelo" />
                </div>
              </div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Placa</div>
                  <input className="input" value={rider.vehicle_plate} onChange={(e) => setRider((p) => ({ ...p, vehicle_plate: e.target.value }))} placeholder="ABC-1D23" />
                </div>
                <div className="field" />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Alimentação</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Café da manhã</div>
                  <select className="input" value={rider.breakfast === null ? "" : rider.breakfast ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, breakfast: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Preferências (café da manhã)</div>
                  <input className="input" value={rider.breakfast_notes} onChange={(e) => setRider((p) => ({ ...p, breakfast_notes: e.target.value }))} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Almoço</div>
                  <select className="input" value={rider.lunch === null ? "" : rider.lunch ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, lunch: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Preferências (almoço)</div>
                  <input className="input" value={rider.lunch_notes} onChange={(e) => setRider((p) => ({ ...p, lunch_notes: e.target.value }))} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Lanche da tarde</div>
                  <select className="input" value={rider.afternoon_snack === null ? "" : rider.afternoon_snack ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, afternoon_snack: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Pode ser do coffee da imersão?</div>
                  <select className="input" value={rider.snack_from_event === null ? "" : rider.snack_from_event ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, snack_from_event: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <div className="label">Preferências (lanche)</div>
                <input className="input" value={rider.snack_notes} onChange={(e) => setRider((p) => ({ ...p, snack_notes: e.target.value }))} />
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Jantar</div>
                  <select className="input" value={rider.dinner === null ? "" : rider.dinner ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, dinner: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Preferências (jantar)</div>
                  <input className="input" value={rider.dinner_notes} onChange={(e) => setRider((p) => ({ ...p, dinner_notes: e.target.value }))} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Restrições alimentares</div>
                  <input className="input" value={rider.dietary_restrictions} onChange={(e) => setRider((p) => ({ ...p, dietary_restrictions: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">Bebidas preferenciais</div>
                  <input className="input" value={rider.preferred_drinks} onChange={(e) => setRider((p) => ({ ...p, preferred_drinks: e.target.value }))} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Kit alimentar do camarim (bolinho, barra, bala, chiclete)?</div>
                  <select className="input" value={rider.dressing_room_food_kit === null ? "" : rider.dressing_room_food_kit ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, dressing_room_food_kit: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field" />
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <div className="label">Informações adicionais (alimentação)</div>
                <textarea className="input" rows={3} value={rider.food_additional_info} onChange={(e) => setRider((p) => ({ ...p, food_additional_info: e.target.value }))} />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Camarim</div>
              <div className="field">
                <div className="label">Preferência por usar sala reservada para se concentrar?</div>
                <select className="input" value={rider.private_room === null ? "" : rider.private_room ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, private_room: e.target.value === "" ? null : e.target.value === "sim" }))}>
                  <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                </select>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Palestra</div>
              <div className="field">
                <div className="label">Tema da palestra</div>
                <input className="input" value={rider.lecture_topic} onChange={(e) => setRider((p) => ({ ...p, lecture_topic: e.target.value }))} placeholder="Ex.: Painel" />
              </div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">PPT (no caso de palestrante)</div>
                  <select className="input" value={rider.needs_ppt === null ? "" : rider.needs_ppt ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, needs_ppt: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Microfone de preferência</div>
                  <select className="input" value={rider.microphone_type} onChange={(e) => setRider((p) => ({ ...p, microphone_type: e.target.value }))}>
                    <option value="headset">Headset</option>
                    <option value="bastao">Bastão</option>
                  </select>
                </div>
              </div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Água no palco</div>
                  <select className="input" value={rider.stage_water} onChange={(e) => setRider((p) => ({ ...p, stage_water: e.target.value }))}>
                    <option value="natural">Natural</option>
                    <option value="gelada">Gelada</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Outra bebida no palco? Qual?</div>
                  <input className="input" value={rider.stage_other_drink} onChange={(e) => setRider((p) => ({ ...p, stage_other_drink: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Presente</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Vai receber presente?</div>
                  <select className="input" value={rider.will_receive_gift === null ? "" : rider.will_receive_gift ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, will_receive_gift: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Opção de presente (se sim)</div>
                  <input className="input" value={rider.gift_option} onChange={(e) => setRider((p) => ({ ...p, gift_option: e.target.value }))} disabled={!rider.will_receive_gift} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Consome bebida alcoólica?</div>
                  <select className="input" value={rider.alcohol_consumption === null ? "" : rider.alcohol_consumption ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, alcohol_consumption: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Preferência de vinho</div>
                  <input className="input" value={rider.wine_preference} onChange={(e) => setRider((p) => ({ ...p, wine_preference: e.target.value }))} disabled={!rider.alcohol_consumption} />
                </div>
              </div>

              <div className="grid2" style={{ marginTop: 10 }}>
                <div className="field">
                  <div className="label">Consome açúcar?</div>
                  <select className="input" value={rider.sugar_consumption === null ? "" : rider.sugar_consumption ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, sugar_consumption: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">Consome chocolate?</div>
                  <select className="input" value={rider.chocolate_consumption === null ? "" : rider.chocolate_consumption ? "sim" : "nao"} onChange={(e) => setRider((p) => ({ ...p, chocolate_consumption: e.target.value === "" ? null : e.target.value === "sim" }))}>
                    <option value="">Selecione…</option><option value="sim">Sim</option><option value="nao">Não</option>
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginTop: 10 }}>
                <div className="label">Outras informações importantes para o presente</div>
                <textarea className="input" rows={3} value={rider.gift_notes} onChange={(e) => setRider((p) => ({ ...p, gift_notes: e.target.value }))} />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <div className="h2" style={{ marginBottom: 8 }}>Observações adicionais</div>
              <div className="field">
                <div className="label">Informações adicionais relevantes</div>
                <textarea className="input" rows={4} value={rider.additional_notes} onChange={(e) => setRider((p) => ({ ...p, additional_notes: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={onSaveRider} disabled={busy}>
              Salvar Rider
            </button>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
