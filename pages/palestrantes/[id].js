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
  const [rider, setRider] = useState({ travel: "", hotel: "", catering: "", technical: "", notes: "" });
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
      setRider({
        travel: data?.travel || "",
        hotel: data?.hotel || "",
        catering: data?.catering || "",
        technical: data?.technical || "",
        notes: data?.notes || "",
      });
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
            Use este formulário para registrar necessidades do palestrante (logística, técnico e observações). Este conteúdo fica atrelado ao palestrante.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div className="field">
              <div className="label">Deslocamento / Transporte</div>
              <textarea className="input" rows={3} value={rider.travel} onChange={(e) => setRider((p) => ({ ...p, travel: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Hospedagem</div>
              <textarea className="input" rows={3} value={rider.hotel} onChange={(e) => setRider((p) => ({ ...p, hotel: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Alimentação</div>
              <textarea className="input" rows={3} value={rider.catering} onChange={(e) => setRider((p) => ({ ...p, catering: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Técnico / Palco</div>
              <textarea className="input" rows={3} value={rider.technical} onChange={(e) => setRider((p) => ({ ...p, technical: e.target.value }))} />
            </div>
            <div className="field">
              <div className="label">Observações</div>
              <textarea className="input" rows={4} value={rider.notes} onChange={(e) => setRider((p) => ({ ...p, notes: e.target.value }))} />
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
