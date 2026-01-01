import Link from "next/link";

const items = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/pdv", label: "PDV" },
  { href: "/app/caixa", label: "Caixa" },
  { href: "/app/agenda", label: "Agenda" },
  { href: "/app/clientes", label: "Clientes" },
  { href: "/app/servicos", label: "Serviços" },
  { href: "/app/produtos", label: "Produtos" },
  { href: "/app/financeiro", label: "Financeiro" },
  { href: "/app/relatorios", label: "Relatórios" },
  { href: "/app/configuracoes", label: "Configurações" },
];

export default function Sidebar() {
  return (
    <aside className="hidden lg:block">
      <div className="card sticky top-4 p-3">
        <nav className="flex flex-col">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {it.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
