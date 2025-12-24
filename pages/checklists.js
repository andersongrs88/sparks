import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { listActiveProfiles } from "../lib/profiles";

export default function ChecklistsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [immersions, setImmersions] = useState([]);
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError("");
        setLoading(true);
        const [profs, im] = await Promise.all([
          listActiveProfiles().catch(() => []),
          supabase.from("immersions").select("id, name, start_date, status, checklist_title, checklist_owner_id").order("start_date", { ascending: false }).limit(300)
        ]);
        if (!mounted) return;
        setProfiles(profs || []);
        if (im.error) throw im.error;
        setImmersions(im.data || []);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Falha ao carregar.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function updateChecklist(immersionId, patch) {
    const prev = immersions;
    setImmersions((arr) => arr.map((i) => i.id === immersionId ? { ...i, ...patch } : i));
    const { error: err } = await supabase.from("immersions").update(patch).eq("id", immersionId);
    if (err) {
      setImmersions(prev);
      setError(err.message);
    }
  }

  return (
    <Layout title="Cadastrar checklist">
      <div className="container">
        <div className="card">
          <div className="h1">Checklists por imersão</div>
          <div className="small muted">Defina o nome do checklist e o dono (usuário responsável). Esse checklist aparece dentro da imersão.</div>

          {error ? <div className="small" style={{ color: "var(--danger)", marginTop: 10 }}>{error}</div> : null}
          {loading ? <div className="small" style={{ marginTop: 10 }}>Carregando...</div> : null}

          {!loading ? (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Imersão</th>
                    <th>Status</th>
                    <th>Checklist</th>
                    <th>Dono</th>
                  </tr>
                </thead>
                <tbody>
                  {immersions.map((im) => (
                    <tr key={im.id}>
                      <td>
                        <a href={`/imersoes/${im.id}`} style={{ fontWeight: 800 }}>{im.name || "(sem nome)"}</a>
                        <div className="small muted">{im.start_date || "—"}</div>
                      </td>
                      <td><span className="badge muted">{im.status || "—"}</span></td>
                      <td style={{ minWidth: 220 }}>
                        <input
                          className="input"
                          value={im.checklist_title || "Plano de Ação"}
                          onChange={(e) => updateChecklist(im.id, { checklist_title: e.target.value })}
                        />
                      </td>
                      <td style={{ minWidth: 240 }}>
                        <select
                          className="input"
                          value={im.checklist_owner_id || ""}
                          onChange={(e) => updateChecklist(im.id, { checklist_owner_id: e.target.value || null })}
                        >
                          <option value="">(sem dono)</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
