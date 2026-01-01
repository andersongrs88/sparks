import AppShell from "@/components/AppShell";

export default function DashboardPage() {
  return (
    <AppShell title="Dashboard">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-6">
          <h2 className="text-base font-semibold">Agendamentos de hoje</h2>
          <p className="muted mt-2 text-sm">Conecte a tabela appointments do Supabase para listar aqui.</p>
        </section>
        <section className="card p-6">
          <h2 className="text-base font-semibold">Aniversariantes do mês</h2>
          <p className="muted mt-2 text-sm">Base: clients.birth_date.</p>
        </section>
        <section className="card p-6">
          <h2 className="text-base font-semibold">Clientes para retorno</h2>
          <p className="muted mt-2 text-sm">Base: last_service_at + retorno configurável por serviço.</p>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <section className="card p-6">
          <h2 className="text-base font-semibold">Financeiro (mês)</h2>
          <p className="muted mt-2 text-sm">Entradas, saídas, fechamento e comissões.</p>
        </section>
        <section className="card p-6">
          <h2 className="text-base font-semibold">Notificações</h2>
          <p className="muted mt-2 text-sm">Fila de confirmações, aniversários e avisos internos.</p>
        </section>
      </div>
    </AppShell>
  );
}
