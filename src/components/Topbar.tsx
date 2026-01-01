import ThemeToggle from "./ThemeToggle";

export default function Topbar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="muted text-sm">StartB Salão</p>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </div>
  );
}
