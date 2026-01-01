import AppShell from "@/components/AppShell";
import { supabaseServer } from "@/lib/supabaseServer";
import { checkInAndOpenPdv } from "@/app/actions/agenda";

function toISODateBR(date: Date) {
  // Data no formato YYYY-MM-DD
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function badgeClass(status: string) {
  switch (status) {
    case "scheduled":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "checked_in":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "no_show":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
    case "cancelled":
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
  }
}

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  checked_in: "Check-in",
  completed: "Concluído",
  no_show: "No-show",
  cancelled: "Cancelado",
};

export default async function Page({
  searchParams,
}: {
  searchParams?: { date?: string; unit?: string };
}) {
  const supabase = supabaseServer();

  // Unidades ativas
  const { data: units } = await supabase.from("units").select("id,name").eq("is_active", true).order("name");

  const today = toISODateBR(new Date());
  const date = searchParams?.date || today;
  const unitId = searchParams?.unit || units?.[0]?.id || "";

  const startIso = `${date}T00:00:00-03:00`;
  const endIso = `${date}T23:59:59.999-03:00`;

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      "id,start_at,end_at,status,notes,sale_id,customer:customers(id,name,phone),professional:profiles(id,name)"
    )
    .eq("unit_id", unitId)
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at", { ascending: true });

  async function checkInAction(formData: FormData) {
    "use server";
    const appointmentId = String(formData.get("appointmentId") || "");
    if (!appointmentId) return;
    await checkInAndOpenPdv(appointmentId);
  }

  return (
    <AppShell title="Agenda">
      <div className="grid gap-4">
        <div className="card p-4">
          <form className="flex flex-wrap items-end gap-3" action="/app/agenda" method="get">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Data</span>
              <input className="input" type="date" name="date" defaultValue={date} />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Unidade</span>
              <select className="input" name="unit" defaultValue={unitId}>
                {(units ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>

            <button className="btn" type="submit">
              Atualizar
            </button>
          </form>
          {error ? <p className="mt-3 text-sm text-red-600">{error.message}</p> : null}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b px-6 py-4">
            <h2 className="text-base font-semibold">Agendamentos do dia</h2>
            <p className="muted mt-1 text-sm">Use “Check-in” para abrir a comanda automaticamente no PDV.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/40 dark:text-zinc-400">
                <tr>
                  <th className="px-6 py-3">Horário</th>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Profissional</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(appts ?? []).length === 0 ? (
                  <tr>
                    <td className="px-6 py-6" colSpan={5}>
                      <p className="muted">Nenhum agendamento encontrado para esta data.</p>
                    </td>
                  </tr>
                ) : null}

                {(appts ?? []).map((a: any) => {
                  const canCheckIn = a.status === "scheduled" || a.status === "checked_in";
                  const customer = a.customer?.name ? `${a.customer.name}${a.customer.phone ? ` — ${a.customer.phone}` : ""}` : "—";
                  const professional = a.professional?.name ?? "—";
                  const status = statusLabel[a.status] ?? a.status;

                  return (
                    <tr key={a.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium">{formatTime(a.start_at)} — {formatTime(a.end_at)}</div>
                        {a.notes ? <div className="muted mt-1 text-xs line-clamp-1">{a.notes}</div> : null}
                      </td>
                      <td className="px-6 py-4">{customer}</td>
                      <td className="px-6 py-4">{professional}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(a.status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canCheckIn ? (
                          <form action={checkInAction} className="inline">
                            <input type="hidden" name="appointmentId" value={a.id} />
                            <button className="btn" type="submit">
                              Check-in / Abrir comanda
                            </button>
                          </form>
                        ) : a.sale_id ? (
                          <a className="btn" href={`/app/pdv?sale=${a.sale_id}`}>
                            Abrir comanda
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
