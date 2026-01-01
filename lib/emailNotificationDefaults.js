// Defaults de regras e templates de notificações por e-mail.
// "key" é o identificador estável (no banco pode ser rule_key e/ou kind).

export const EMAIL_RULES_DEFAULTS = [
  {
    key: "immersion_created",
    label: "Imersão criada",
    description: "Dispara imediatamente quando uma imersão é criada ou clonada. Envia para Consultor e Designer.",
    cadence: "event",
    lookback_minutes: 60,
    is_enabled: true,
    config: { send_to: ["consultant", "designer"] },
  },
  {
    key: "task_overdue_daily",
    label: "Tarefas atrasadas (diário)",
    description: "Diário. Envia para cada responsável com tarefas vencidas e não concluídas.",
    cadence: "daily",
    lookback_minutes: 60,
    is_enabled: true,
    config: { max_items: 50 },
  },
  {
    key: "task_due_soon_weekly",
    label: "Vencendo em até 7 dias (semanal)",
    description: "Semanal. Envia (padrão na segunda) tarefas que vencem nos próximos 7 dias.",
    cadence: "weekly",
    lookback_minutes: 10080,
    is_enabled: true,
    config: { weekly_day: 1, due_days: 7, max_items: 50 },
  },
  {
    key: "immersion_risk_daily",
    label: "Risco de imersão (diário)",
    description: "Diário. Envia para o Consultor quando a imersão acumula atrasos acima do limiar.",
    cadence: "daily",
    lookback_minutes: 60,
    is_enabled: true,
    config: { min_overdue: 5, min_overdue_exec: 3, max_items: 50 },
  },
];

export const EMAIL_TEMPLATES_DEFAULTS = {
  immersion_created: {
    subject: "Sparks • Nova imersão criada: {{immersion}} — {{date}}",
    intro: "Olá {{name}}, uma nova imersão foi criada e você foi definido(a) como responsável.",
    footer: "Abra a imersão para seguir com o planejamento: {{app}}",
  },
  task_overdue_daily: {
    subject: "Sparks • {{count}} tarefa(s) atrasada(s) — {{date}}",
    intro: "Olá {{name}}, identificamos {{count}} tarefa(s) atrasada(s). Priorize as entregas abaixo.",
    footer: "Acesse o painel para atualizar o status e replanejar prazos: {{app}}",
  },
  task_due_soon_weekly: {
    subject: "Sparks • {{count}} tarefa(s) vencendo em até 7 dias — {{date}}",
    intro: "Olá {{name}}, estas tarefas vencem nos próximos 7 dias. Revise prazos e garanta as entregas.",
    footer: "Abra suas tarefas e organize o Kanban: {{app}}",
  },
  immersion_risk_daily: {
    subject: "Sparks • Atenção: risco na imersão \"{{immersion}}\" — {{count}} atrasadas",
    intro: "Olá {{name}}, a imersão \"{{immersion}}\" entrou em status de risco por acúmulo de atrasos ({{count}} tarefa(s)).",
    footer: "Acesse a imersão e trate as pendências: {{app}}",
  },
};
