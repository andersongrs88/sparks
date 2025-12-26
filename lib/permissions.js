// Permissões do Sparks (web + mobile)
// - Acesso total: admin, consultor_educacao, designer
// - Edita apenas PDCA: eventos, producao, mentoria, outros
// - Visualização: viewer

export const FULL_ACCESS_ROLES = ["admin", "consultor_educacao", "designer"];
export const PDCA_EDIT_ROLES = ["eventos", "producao", "mentoria", "outros"];

export function hasFullAccess(role) {
  return FULL_ACCESS_ROLES.includes(role);
}

export function canEditPdca(role) {
  return hasFullAccess(role) || PDCA_EDIT_ROLES.includes(role);
}


export function canEditTask({ role, userId, taskResponsibleId } = {}) {
  // Regras:
  // - Acesso total (admin) pode editar tudo
  // - Visualização (viewer) não edita nada
  // - Demais papéis: edita apenas se for o responsável pela tarefa
  if (hasFullAccess(role)) return true;
  if (!userId) return false;
  if (role === "viewer") return false;
  return !!taskResponsibleId && String(taskResponsibleId) === String(userId);
}

export function roleLabel(role) {
  if (!role) return "-";
  if (role === "admin") return "Administrador";
  if (role === "consultor_educacao") return "Consultor (Educação)";
  if (role === "designer") return "Designer Instrucional";
  if (role === "eventos") return "Eventos";
  if (role === "producao") return "Produção";
  if (role === "mentoria") return "Mentoria";
  if (role === "outros") return "Outros";
  if (role === "viewer") return "Visualização";
  return role;
}
