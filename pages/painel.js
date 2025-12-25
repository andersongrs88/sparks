import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import BottomSheet from "../components/BottomSheet";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { syncOverdueTasksGlobal, bulkUpdateTasks, isTaskDone, normalizeTaskStatus } from "../lib/tasks";

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function daysLate(due) {
  if (!due) return 0;
  const today = new Date();
  const t = new Date(iso(today) + "T00:00:00");
  const d = new Date(due + "T00:00:00");
  return Math.floor((t.getTime() - d.getTime()) / (24 * 3600 * 1000));

function isTodayISO(dateISO) {
  if (!dateISO) return false;
  const today = new Date();
  return dateISO === iso(today);
}
function withinNextDays(dateISO, days) {
  if (!dateISO) return false;
  const today = new Date(iso(new Date()) + "T00:00:00");
  const d = new Date(dateISO + "T00:00:00");
  const diff = Math.floor((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
  return diff >= 0 && diff <= days;
}
}

export default function PainelPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);

  const [query, setQuery] = useState("");
  // A tela foi redesenhada para operar por blocos (Atrasadas, Vencem hoje, Próximos 7 dias, Todas).
  // Mantemos o filtro "Somente atrasadas" como atalho, mas o comportamento principal é por agrupamento.
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [phase, setPhase] = useState("all");
  const [status, setStatus] = useState("Pendentes");
  const [immersionId, setImmersionId] = useState("all");
  const [immersionOptions, setImmersionOptions] = useState([]);

  const [showFilters, setShowFilters] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());


  async function load() {
    try {
      setError("");
      setLoading(true);
      // Sincroniza tarefas atrasadas (protege bases antigas)
      await syncOverdueTasksGlobal();

      let q = supabase
        .from("immersion_tasks")
        .select("id, immersion_id, title, phase, status, due_date, responsible_id, notes, updated_at, done_at, created_at, immersions:immersions(id, immersion_name)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(1200);

      if (immersionId !== "all") q = q.eq("immersion_id", immersionId);
      if (phase !== "all") q = q.eq("phase", phase);

      // Status: pendentes vs concluídas usando helper robusto
      if (status === "Concluídas") {
        q = q.or("status.ilike.%conclu%,done_at.not.is.null");
      } else {
        q = q.or("status.is.null,status.not.ilike.%conclu%,done_at.is.null");
      }

      if (query?.trim()) {
        const term = query.trim();
        q = q.or(`title.ilike.%${term}%,immersions.immersion_name.ilike.%${term}%`);
      }

      const { data, error: e } = await q;
      if (e) throw e;

      const rows = (data || []).map((t) => ({
        ...t,
        immersion_name: t?.immersions?.immersion_name || t?.immersion_name || "—",
      }));

      setTasks(rows || []);
    } catch (e) {
      setError(e?.message || "Erro ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from("immersions")
          .select("id, immersion_name, start_date")
          .order("start_date", { ascending: false })
          .limit(300);
        if (e) throw e;
        if (!mounted) return;
        setImmersionOptions((data || []).map((r) => ({ id: r.id, name: r.immersion_name, start_date: r.start_date })));
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authLoading, user]);

  async function load() {
    try {
      setError("");
      setLoading(true);

      // Governança: mantém tarefas vencidas com status "Atrasada" (best-effort)
      try { await syncOverdueTasksGlobal(); } catch {}

      // bases antigas podem não ter evidence_link/evidence_path.
      // OBS: algumas bases também não têm FK entre immersion_tasks -> immersions,
      // então o join pode retornar nulo. A tela faz fallback com um map local.
      const base = "id, immersion_id, title, phase, status, due_date, done_at, notes, immersions(immersion_name, status)";
      async function run(withEvidence) {
        const sel = withEvidence ? `${base}, evidence_link, evidence_path` : base;
        let q = supabase
          .from("immersion_tasks")
          .select(sel)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(500);
        if (immersionId !== "all") q = q.eq("immersion_id", immersionId);
        if (phase !== "all") q = q.eq("phase", phase);
        if (status === "Pendentes") q = q.neq("status", "Concluída");
        if (status === "Concluídas") q = q.eq("status", "Concluída");
        if (query.trim()) q = q.ilike("title", `%${query.trim()}%`);
        const { data, error: e } = await q;
        if (e) throw e;
        return data || [];
      }

      const today = iso(new Date());
      let rows = [];
      try {
        rows = await run(true);
      } catch (e) {
        const msg = String(e?.message || "");
        if ((msg.includes("evidence_link") || msg.includes("evidence_path")) && msg.includes("does not exist")) {
          rows = await run(false);
        } else {
          throw e;
        }
      }
      if (onlyOverdue) rows = rows.filter((t) => t.due_date && t.status !== "Concluída" && t.due_date < today);

      // Fallback: se o join não trouxe os dados da imersão, carregamos nomes manualmente.
      const missing = (rows || []).some((r) => !r.immersions);
      if (missing) {
        const ids = Array.from(new Set((rows || []).map((r) => r.immersion_id).filter(Boolean)));
        if (ids.length) {
          const { data: ims, error: ie } = await supabase
            .from("immersions")
            .select("id, immersion_name, status")
            .in("id", ids);
          if (!ie && ims) {
            const map = new Map(ims.map((i) => [i.id, i]));
            rows = (rows || []).map((r) => ({
              ...r,
              immersions: r.immersions || map.get(r.immersion_id) || null,
            }));
          }
        }
      }

      setTasks(rows);
    } catch (e) {
      setError(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, query, onlyOverdue, phase, status, immersionId]);

  const counts = useMemo(() => {
    const today = iso(new Date());
    const total = tasks.length;
    // Robustez: bases podem usar "Concluida" (sem acento) ou preencher done_at.
    const done = tasks.filter((t) => isTaskDone(t)).length;
    const overdue = tasks.filter((t) => t.due_date && !isTaskDone(t) && t.due_date < today).length;
    return { total, done, overdue };
  }, [tasks]);

  const grouped = useMemo(() => {
    const today = iso(new Date());
    const t7 = new Date(today + "T00:00:00");
    t7.setDate(t7.getDate() + 7);
    const plus7 = iso(t7);

    const pending = (tasks || []).filter((t) => !(t.status === "Concluída" || t.status === "Concluida" || !!t.done_at));
    const overdue = pending.filter((t) => t.due_date && t.due_date < today);
    const dueToday = pending.filter((t) => t.due_date && t.due_date === today);
    const next7 = pending.filter((t) => t.due_date && t.due_date > today && t.due_date <= plus7);

    return {
      overdue,
      dueToday,
      next7,
      all: tasks || [],
      plus7
    };
  }, [tasks]);

  function TaskRow({ t, selectedIds, setSelectedIds }) {
    const done = isTaskDone(t);
    const due = t?.due_date || null;

    const lateDays = (!done && due) ? daysLate(due) : 0;
    const isLate = lateDays > 0;

    const slaLabel = isLate ? `Atrasada ${lateDays}d` : (isTodayISO(due) ? "Vence hoje" : (withinNextDays(due, 7) ? "Em 7 dias" : ""));
    const slaBadge = isLate ? "badge danger" : (isTodayISO(due) ? "badge warn" : (withinNextDays(due, 7) ? "badge info" : "badge muted"));

    const checked = selectedIds?.has(t.id);

    return (
      <tr key={t.id}>
        <td style={{ width: 36 }}>
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => {
              const c = e.target.checked;
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (c) next.add(t.id);
                else next.delete(t.id);
                return next;
              });
            }}
            aria-label="Selecionar tarefa"
          />
        </td>
        <td>
          <a href={`/imersoes/${t.immersion_id}`} style={{ fontWeight: 800 }}>
            {t.immersions?.immersion_name || t.immersion_name || "-"}
          </a>
          <div className="small muted">{t.immersions?.status || "-"}</div>
        </td>
        <td>{t.title}</td>
        <td><span className="badge muted">{t.phase === "PA-PRE" ? "PA-PRÉ" : (t.phase || "-")}</span></td>
        <td>
          <span className={done ? "badge success" : "badge muted"}>
            {done ? "Concluída" : ((t.status === "Concluida" ? "Concluída" : t.status) || "Pendente")}
          </span>
        </td>
        <td>{slaLabel ? <span className={slaBadge}>{slaLabel}</span> : <span className="small muted">—</span>}</td>
        <td>{due ? new Date(due + "T00:00:00").toLocaleDateString("pt-BR") : <span className="small muted">—</span>}</td>
        <td>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={() => router.push(`/imersoes/${t.immersion_id}`)}>Abrir</button>
          </div>
        </td>
      </tr>
    );
  }


  if (authLoading) return null;
  if (!user) return null;

  return (
    <Layout title="Painel por Plano de Ação">
      <div className="container">
        <div className="card">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="h1" style={{ marginBottom: 6 }}>Painel por Plano de Ação</div>
              <div className="small muted">Acompanhe PA-PRÉ, DURANTE, PÓS e ações cadastradas manualmente.</div>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <div className="pill">Total: <b>{counts.total}</b></div>
              <div className="pill">Atrasadas: <b>{counts.overdue}</b></div>
              <div className="pill">Concluídas: <b>{counts.done}</b></div>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="input sm"
              style={{ maxWidth: 420 }}
              placeholder="Buscar por tarefa ou imersão..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <div className="onlyMobile">
              <button className="btn sm" onClick={() => setShowFilters(true)}>Filtros</button>
            </div>

            <div className="onlyDesktop" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div className="toolbarGroup">
              <span className="toolbarLabel">Imersão</span>
              <select className="input sm" value={immersionId} onChange={(e) => setImmersionId(e.target.value)}>
                <option value="all">Todas</option>
                {(immersionOptions || []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>

            <div className="toolbarGroup">
              <span className="toolbarLabel">Fase</span>
              <select className="input sm" value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="all">Todas</option>
                <option value="PA-PRE">PA-PRÉ</option>
                <option value="DURANTE">DURANTE</option>
                <option value="POS">PÓS</option>
              </select>
            </div>

            <div className="toolbarGroup">
              <span className="toolbarLabel">Status</span>
              <select className="input sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Pendentes">Pendentes</option>
                <option value="Concluídas">Concluídas</option>
              </select>
            </div>

            <label className="row" style={{ gap: 8, marginLeft: 2 }}>
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
              <span className="small">Somente atrasadas</span>
            </label>
          </div>

          
          <BottomSheet
            open={showFilters}
            title="Filtros"
            onClose={() => setShowFilters(false)}
            footer={
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn ghost" onClick={() => { setQuery(""); setPhase("all"); setStatus("Pendentes"); setImmersionId("all"); setOnlyOverdue(false); }}>Limpar</button>
                <button className="btn" onClick={() => setShowFilters(false)}>Aplicar</button>
              </div>
            }
          >
            <div className="grid2" style={{ gap: 12 }}>
              <div>
                <div className="label">Imersão</div>
                <select className="input" value={immersionId} onChange={(e) => setImmersionId(e.target.value)}>
                  <option value="all">Todas</option>
                  {(immersionOptions || []).map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="label">Fase</div>
                <select className="input" value={phase} onChange={(e) => setPhase(e.target.value)}>
                  <option value="all">Todas</option>
                  <option value="PA-PRE">PA-PRÉ</option>
                  <option value="DURANTE">DURANTE</option>
                  <option value="POS">PÓS</option>
                </select>
              </div>
              <div>
                <div className="label">Status</div>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="Pendentes">Pendentes</option>
                  <option value="Concluídas">Concluídas</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24 }}>
                <input id="onlyOverdue" type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
                <label htmlFor="onlyOverdue" className="small">Somente atrasadas</label>
              </div>
            </div>
          </BottomSheet>

{error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          {loading ? <p>Carregando...</p> : null}

          {!loading && tasks.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>Nenhuma tarefa encontrada para os filtros selecionados.</p>
          ) : null}

          {!loading && tasks.length > 0 ? (

            {selectedIds.size > 0 ? (
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2" style={{ margin: 0 }}>Ações em lote</div>
                    <div className="small muted" style={{ marginTop: 4 }}>{selectedIds.size} selecionada(s)</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn sm ghost" onClick={() => setSelectedIds(new Set())}>Limpar seleção</button>
                    <button className="btn sm" onClick={async () => {
                      try {
                        setLoading(true);
                        await bulkUpdateTasks(Array.from(selectedIds), { status: "Concluída", done_at: new Date().toISOString() });
                        // refresh
                        await load();
                        setSelectedIds(new Set());
                      } catch (e) { setError(e?.message || "Erro ao concluir em lote"); }
                      finally { setLoading(false); }
                    }}>Concluir</button>
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {/* BLOCO 1: Atrasadas */}
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2" style={{ margin: 0 }}>Atrasadas</div>
                    <div className="small muted" style={{ marginTop: 4 }}>Ação imediata para destravar execução.</div>
                  </div>
                  <span className="badge danger">{grouped.overdue.length}</span>
                </div>
                {grouped.overdue.length === 0 ? <div className="small muted" style={{ marginTop: 10 }}>Nenhuma tarefa atrasada.</div> : (
                  <div className="tableWrap" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>Imersão</th>
                          <th>Tarefa</th>
                          <th>Fase</th>
                          <th>Status</th>
                          <th>Atraso</th>
                          <th>Prazo</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.overdue.slice(0, 60).map((t) => <TaskRow key={t.id} t={t} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BLOCO 2: Vencem hoje */}
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2" style={{ margin: 0 }}>Vencem hoje</div>
                    <div className="small muted" style={{ marginTop: 4 }}>Priorize entregas com prazo do dia.</div>
                  </div>
                  <span className="badge">{grouped.dueToday.length}</span>
                </div>
                {grouped.dueToday.length === 0 ? <div className="small muted" style={{ marginTop: 10 }}>Nenhuma tarefa vencendo hoje.</div> : (
                  <div className="tableWrap" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>Imersão</th>
                          <th>Tarefa</th>
                          <th>Fase</th>
                          <th>Status</th>
                          <th>Atraso</th>
                          <th>Prazo</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.dueToday.slice(0, 60).map((t) => <TaskRow key={t.id} t={t} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BLOCO 3: Próximos 7 dias */}
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2" style={{ margin: 0 }}>Próximos 7 dias</div>
                    <div className="small muted" style={{ marginTop: 4 }}>Foco no que vence até {grouped.plus7}.</div>
                  </div>
                  <span className="badge">{grouped.next7.length}</span>
                </div>
                {grouped.next7.length === 0 ? <div className="small muted" style={{ marginTop: 10 }}>Nenhuma tarefa vencendo nos próximos 7 dias.</div> : (
                  <div className="tableWrap" style={{ marginTop: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>Imersão</th>
                          <th>Tarefa</th>
                          <th>Fase</th>
                          <th>Status</th>
                          <th>Atraso</th>
                          <th>Prazo</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.next7.slice(0, 60).map((t) => <TaskRow key={t.id} t={t} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BLOCO 4: Todas */}
              <div className="card" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="h2" style={{ margin: 0 }}>Todas</div>
                    <div className="small muted" style={{ marginTop: 4 }}>Visão completa, respeitando filtros acima.</div>
                  </div>
                  <span className="badge muted">{grouped.all.length}</span>
                </div>
                <div className="tableWrap" style={{ marginTop: 10 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                          <th>Imersão</th>
                          <th>Tarefa</th>
                        <th>Fase</th>
                        <th>Status</th>
                        <th>Atraso</th>
                        <th>Prazo</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.all.slice(0, 120).map((t) => <TaskRow key={t.id} t={t} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />)}
                    </tbody>
                  </table>
                </div>
                {grouped.all.length > 120 ? <div className="small muted" style={{ marginTop: 8 }}>Mostrando 120 de {grouped.all.length}. Refine os filtros para reduzir a lista.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
