// Permissões do Sparks (web + mobile)
// - Acesso total: admin, consultor_educacao, designer
// - Edita apenas PDCA: eventos, producao, mentoria, outros
// - Visualização: viewer

// Roles do Sparks (web + mobile)
// Regras solicitadas:
// - admin = acesso total
// - consultor = acesso semi-admin (gestão de imersões e conteúdo)
// - designer = acesso semi-admin (gestão de imersões e conteúdo)
// - eventos = apenas Menu Imersões, não vê Custos, edita apenas PDCA
// - producao = apenas Menu Imersões, não vê Custos, edita apenas PDCA
// - viewer = visualização

// Compatibilidade: versões antigas usam "consultor_educacao".
export function normalizeRole(role) {
  const r = String(role || "").trim();
  if (!r) return "viewer";
  if (r === "consultor_educacao") return "consultor";
  return r;
}

export const FULL_ACCESS_ROLES = ["admin", "consultor", "designer", "consultor_educacao"]; // inclui legado
export const PDCA_EDIT_ROLES = ["eventos", "producao", "mentoria", "outros"]; // legado: mentoria/outros

export function hasFullAccess(role) {
  return FULL_ACCESS_ROLES.includes(normalizeRole(role)) || FULL_ACCESS_ROLES.includes(role);
}

export function canEditPdca(role) {
  const r = normalizeRole(role);
  return hasFullAccess(r) || PDCA_EDIT_ROLES.includes(r);
}

export function isAdmin(role) {
  return normalizeRole(role) === "admin";
}

export function isLimitedImmersionRole(role) {
  const r = normalizeRole(role);
  return r === "eventos" || r === "producao" || r === "tecnica";
}

export function canSeeMenuItem(role, itemKey) {
  // itemKey: dashboard | immersoes | painel | relatorios | templates | notificacoes_email | palestrantes | usuarios
  const r = normalizeRole(role);
  if (r === "admin") return true;

  // Perfis limitados: apenas Imersões
  if (isLimitedImmersionRole(r)) {
    return itemKey === "imersoes";
  }

  // Semi-admin: tudo, exceto gestão de usuários
  if (r === "consultor" || r === "designer") {
    return !["usuarios","notificacoes_email"].includes(itemKey);
  }

  // Demais papéis: visão operacional (sem usuários e sem templates avançados)
  if (r === "mentoria" || r === "outros") {
    return ["dashboard", "imersoes", "painel", "relatorios"].includes(itemKey);
  }

  // viewer
  return ["dashboard", "imersoes"].includes(itemKey);
}


export function canEditTask({ role, userId, taskResponsibleId } = {}) {
  // Regras:
  // - Acesso total (admin) pode editar tudo
  // - Visualização (viewer) não edita nada
  // - Demais papéis: edita apenas se for o responsável pela tarefa
  const r = normalizeRole(role);
  if (hasFullAccess(r)) return true;
  if (!userId) return false;
  if (r === "viewer") return false;
  return !!taskResponsibleId && String(taskResponsibleId) === String(userId);
}

export function roleLabel(role) {
  const r = normalizeRole(role);
  if (!r) return "-";
  if (r === "admin") return "Administrador";
  if (r === "consultor") return "Consultor";
  if (r === "designer") return "Designer";
  if (r === "eventos") return "Eventos";
  if (r === "producao") return "Produção";
  if (r === "tecnica") return "Técnica";
  if (r === "mentoria") return "Mentoria";
  if (r === "outros") return "Outros";
  if (r === "viewer") return "Visualização";
  return r;
}
