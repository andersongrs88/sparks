// Permissões simplificadas: sem dependência de "áreas".
// Regra: Admin (e papéis de apoio) podem editar tudo.
// Demais usuários podem editar apenas tarefas atribuídas a eles.

export const FULL_ACCESS_ROLES = ["admin", "consultor_educacao", "designer"];

export function hasFullAccess(sessionOrRole) {
  const role = typeof sessionOrRole === "string" ? sessionOrRole : sessionOrRole?.role;
  return FULL_ACCESS_ROLES.includes(role);
}

export function canEditTask({ role, userId, taskResponsibleId }) {
  if (!role || !userId) return false;
  if (hasFullAccess(role)) return true;
  if (!taskResponsibleId) return false;
  return String(taskResponsibleId) === String(userId);
}

export function roleLabel(role) {
  if (!role) return "-";
  if (role === "admin") return "Admin";
  if (role === "consultor_educacao") return "Consultor de Educação";
  if (role === "designer") return "Designer";
  if (role === "viewer") return "Visualização";
  if (role === "usuario") return "Usuário";
  return role;
}
