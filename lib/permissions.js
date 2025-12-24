export const FULL_ACCESS_ROLES = ["admin", "consultor_educacao", "designer"];

export const BASIC_ROLES = ["eventos", "tecnica", "relacionamento", "producao", "mentoria", "viewer"];

// Áreas operacionais (roles que representam áreas)
export const AREAS = ["eventos", "tecnica", "relacionamento", "producao", "mentoria"];

export function canEditTask(role, taskArea) {
  if (!role) return false;
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (!taskArea) return false;
  return role === taskArea; // área edita apenas as próprias tarefas
}

export function hasFullAccess(session) {
  const role = session?.role;
  return FULL_ACCESS_ROLES.includes(role);
}

export function isBasicRole(role) {
  return BASIC_ROLES.includes(role);
}

export function roleLabel(role) {
  if (!role) return "-";
  if (role === "admin") return "Admin";
  if (role === "consultor_educacao") return "Consultor de Educação";
  if (role === "designer") return "Designer";
  if (role === "eventos") return "Eventos";
  if (role === "tecnica") return "Técnica";
  if (role === "relacionamento") return "Relacionamento";
  if (role === "producao") return "Produção";
  if (role === "mentoria") return "Mentoria";
  if (role === "viewer") return "Visualização";
  return role;
}
