// Centralized constants for Immersions (keeps Create/Edit/List consistent)
//
// Statuses (product decision):
// - Em andamento
// - Planejamento
// - Concluída
// - Cancelada
//
// Legacy statuses supported for display/filters:
// - Em execução -> Em andamento

export const IMMERSION_STATUSES = ["Em andamento", "Planejamento", "Concluída", "Cancelada"];

export function normalizeImmersionStatus(status) {
  if (!status) return "";
  if (status === "Em execução") return "Em andamento";
  return status;
}

// Options already used in the project (do not change without product approval)
export const ROOMS = ["Brasil", "São Paulo", "PodCast"];
export const IMMERSION_FORMATS = ["Presencial", "Online", "Zoom", "Entrada", "Extras", "Giants", "Outras"];
