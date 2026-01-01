"use client";

import { useTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn-ghost" onClick={toggle} aria-label="Alternar tema">
      {theme === "dark" ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
