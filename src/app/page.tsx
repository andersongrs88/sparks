import Link from "next/link";

export default function Home() {
  return (
    <main className="container-page py-12">
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">StartB Salão</h1>
        <p className="mt-2 muted">
          Starter pronto para evoluir módulos: agenda, financeiro, relatórios e notificações.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn" href="/login">Entrar</Link>
          <Link className="btn-ghost" href="/app">Ir para o app</Link>
        </div>
      </div>
    </main>
  );
}
