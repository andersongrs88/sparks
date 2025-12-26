import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { listSpeakers, createSpeaker, updateSpeaker, deleteSpeaker } from "../lib/speakers";

export default function PalestrantesPage() {
  const router = useRouter();
  const { isFullAccess } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    is_internal: true,
    vignette_name: ""
  });

  async function load() {
    setBusy(true);
    setError("");
    try {
      const data = await listSpeakers();
      setItems(data);
    } catch (e) {
      setError(e?.message || "Falha ao carregar palestrantes.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createSpeaker({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        is_internal: !!form.is_internal,
        vignette_name: form.vignette_name.trim() || null
      });
      setForm({ full_name: "", email: "", is_internal: true, vignette_name: "" });
      await load();
    } catch (e2) {
      setError(e2?.message || "Falha ao criar palestrante.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleInternal(id, next) {
    setBusy(true);
    setError("");
    try {
      await updateSpeaker(id, { is_internal: next });
      await load();
    } catch (e) {
      setError(e?.message || "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Excluir este palestrante?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteSpeaker(id);
      await load();
    } catch (e) {
      setError(e?.message || "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Palestrantes">
      <div className="pageHeader">
        <div>
          <div className="h1">Palestrantes</div>
          <div className="small muted">Cadastro central para seleção na aba Trainer/Palestrante da Imersão.</div>
        </div>
      </div>

      {!isFullAccess ? (
        <div className="alert warn">Sem permissão para gerenciar palestrantes.</div>
      ) : (
        <>
          <div className="card">
            <div className="h2">Novo palestrante</div>
            <form onSubmit={onCreate} style={{ marginTop: 10 }}>
              <div className="grid2">
                <div className="field">
                  <div className="label">Nome completo <span className="req">(obrigatório)</span></div>
                  <input className="input" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} required />
                </div>
                <div className="field">
                  <div className="label">E-mail</div>
                  <input className="input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
              </div>

              <div className="grid2">
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

              <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                <button className="btn primary" disabled={busy}>Salvar</button>
                <button className="btn" type="button" onClick={() => setForm({ full_name: "", email: "", is_internal: true, vignette_name: "" })} disabled={busy}>
                  Limpar
                </button>
              </div>

              {error ? <div className="alert danger" style={{ marginTop: 12 }}>{error}</div> : null}
            </form>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="h2">Lista</div>
            {busy ? <div className="small muted" style={{ marginTop: 10 }}>Carregando...</div> : null}
            <div className="tableWrap" style={{ marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Tipo</th>
                    <th>Vinheta</th>
                    <th style={{ width: 140 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.full_name}</td>
                      <td className="muted">{it.email || "-"}</td>
                      <td>
                        <span className={it.is_internal ? "badge ok" : "badge"}>{it.is_internal ? "Interno" : "Externo"}</span>
                      </td>
                      <td className="muted">{it.vignette_name || "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn" type="button" onClick={() => router.push(`/palestrantes/${it.id}`)} disabled={busy}>
                            Abrir
                          </button>
                          <button className="btn" type="button" onClick={() => onToggleInternal(it.id, !it.is_internal)} disabled={busy}>
                            Alternar
                          </button>
                          <button className="btn danger" type="button" onClick={() => onDelete(it.id)} disabled={busy}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr><td colSpan={5} className="muted">Nenhum palestrante cadastrado.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
