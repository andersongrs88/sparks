export const immersions = [
  {
    id: "IM-001",
    name: "Imersão Gestão em Marketing Digital",
    type: "Presencial",
    start: "2026-01-20",
    end: "2026-01-21",
    location: "Alphaville",
    status: "Planejamento",
    checklist: { total: 28, done: 9, late: 3 }
  },
  {
    id: "IM-002",
    name: "Imersão Liderança e Performance",
    type: "Híbrido",
    start: "2026-02-03",
    end: "2026-02-04",
    location: "Barueri",
    status: "Em andamento",
    checklist: { total: 34, done: 19, late: 1 }
  },
  {
    id: "IM-003",
    name: "Imersão Comercial Avançado",
    type: "Online ao vivo",
    start: "2026-02-18",
    end: "2026-02-18",
    location: "Zoom",
    status: "Concluída",
    checklist: { total: 22, done: 22, late: 0 }
  }
];

export function getImmersionById(id) {
  return immersions.find((x) => x.id === id) || null;
}
